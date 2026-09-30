"""Bounded SSH onboarding worker. JSON on stdin/stdout; never log credentials.

Only fixed discovery/key-install operations are exposed. No shell config evaluation.
"""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import socket
import sys
import time

import paramiko

SAFE = {"hostname", "user", "port", "proxyjump"}
IGNORED = {"identityfile", "identitiesonly", "forwardagent", "serveraliveinterval",
           "serveralivecountmax", "tcpkeepalive", "compression", "addkeystoagent",
           "preferredauthentications", "stricthostkeychecking", "userknownhostsfile",
           "requesttty", "forwardx11", "forwardx11trusted", "loglevel"}


def parse_config(text):
    if len(text) > 32768:
        raise ValueError("SSH 配置不能超过 32 KiB")
    blocks, current, ignored = [], None, set()
    for line in text.splitlines():
        parts = shlex.split(re.sub(r"^(\s*\w+)\s*=\s*", r"\1 ", line), comments=True)
        if not parts:
            continue
        key, values = parts[0].lower(), parts[1:]
        if key == "host":
            if not values or any(not re.fullmatch(r"[A-Za-z0-9_.*?!-]{1,120}", v) for v in values):
                raise ValueError("Host 别名格式无效")
            current = ({"patterns": values, "options": {}})
            blocks.append(current)
        elif key in IGNORED:
            ignored.add(key)
        elif key in SAFE:
            if current is None or len(values) != 1:
                raise ValueError("请把连接参数写在 Host 段内，每项只填写一个值")
            current["options"].setdefault(key, values[0])
        else:
            raise ValueError("不支持此 SSH 指令；请使用 Host、HostName、User、Port、ProxyJump（不执行 Include、Match 或 ProxyCommand）")
    aliases = list(dict.fromkeys(p for b in blocks for p in b["patterns"] if not any(c in p for c in "*?!")))
    if len(aliases) > 100:
        raise ValueError("最多解析 100 个 SSH 别名")
    return blocks, aliases, sorted(ignored)


def resolve(text, alias):
    import fnmatch
    blocks, aliases, _ = parse_config(text)
    if alias not in aliases:
        raise ValueError("请选择配置中明确声明的 Host 别名")

    def lookup(name):
        opts = {}
        for b in blocks:
            patterns = b["patterns"]
            if any(fnmatch.fnmatchcase(name, p[1:]) for p in patterns if p.startswith("!")):
                continue
            if any(fnmatch.fnmatchcase(name, p) for p in patterns if not p.startswith("!")):
                for k, v in b["options"].items():
                    opts.setdefault(k, v)
        host, user, port = opts.get("hostname", name), opts.get("user", ""), opts.get("port", "22")
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,253}", host) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]{0,63}", user):
            raise ValueError("每台目标或跳板需要有效的 HostName 和 User（不展开环境变量）")
        if not port.isdigit() or not 1 <= int(port) <= 65535:
            raise ValueError("SSH 端口必须在 1–65535 之间")
        return {"alias": name, "host": host, "user": user, "port": int(port)}, opts.get("proxyjump", "none")

    def chain(name, seen):
        if name in seen or len(seen) >= 4:
            raise ValueError("跳板配置存在循环或超过三层")
        node, jump = lookup(name)
        hops = []
        if jump.lower() != "none":
            for part in jump.split(","):
                if part not in aliases:
                    raise ValueError("请将每个跳板声明为 Host 段，并在 ProxyJump 中使用别名")
                hops.extend(chain(part, seen + [name]))
        hops.append(node)
        if len(hops) > 4 or len({(x['host'], x['port'], x['user']) for x in hops}) != len(hops):
            raise ValueError("跳板链重复或超过三层")
        return hops
    return chain(alias, [])


class Challenge(Exception):
    def __init__(self, payload):
        self.payload = payload


def fingerprint(key):
    return "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")


def state_dir():
    path = Path(os.environ.get("LAB_SSH_STATE_DIR", "/app/ssh-state"))
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.chmod(0o700)
    return path


def application_key():
    root = state_dir()
    with (root / "state.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = root / "id_rsa"
        if not path.exists():
            key = paramiko.RSAKey.generate(3072)
            # Atomic publication: parallel workers never see a partial key.
            temp = root / "id_rsa.new"
            key.write_private_key_file(str(temp))
            temp.chmod(0o600)
            temp.replace(path)
        return paramiko.RSAKey.from_private_key_file(str(path))


def check_host(node, key, approved):
    identity = f"[{node['host']}]:{node['port']}"
    fp = fingerprint(key)
    root = state_dir()
    with (root / "state.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = root / "hosts.json"
        known = json.loads(path.read_text()) if path.exists() else {}
        if identity in known and known[identity] != fp:
            raise Challenge({"status": "FAILED", "message": "主机指纹已变化，连接已阻止；请管理员线下核实并维护主机指纹记录"})
        if identity not in known:
            if approved.get(identity) != fp:
                raise Challenge({"status": "HOST_KEY_REQUIRED", "host": identity, "fingerprint": fp,
                                 "message": "首次连接此主机，请核对 SSH 主机指纹"})
            known[identity] = fp
            temp = root / "hosts.json.new"
            temp.write_text(json.dumps(known))
            temp.chmod(0o600)
            temp.replace(path)


def run_fixed(client, command):
    channel = client.open_session(timeout=10)
    channel.settimeout(20)
    try:
        channel.exec_command(command)
        output = bytearray()
        deadline = time.monotonic() + 25
        while True:
            if time.monotonic() > deadline:
                raise TimeoutError()
            if channel.recv_ready():
                output.extend(channel.recv(8192))
                if len(output) > 65536:
                    raise ValueError("服务器响应超过限制")
            if channel.recv_stderr_ready():
                channel.recv_stderr(8192)  # Remote errors may contain private paths; never forward.
            if channel.exit_status_ready() and not channel.recv_ready():
                if channel.recv_exit_status() != 0:
                    raise ValueError("服务器未能执行固定的检测或公钥安装命令")
                return output.decode("utf-8", "replace")
            time.sleep(0.02)
    finally:
        channel.close()


def install_key(client, key):
    public = key.get_name() + " " + key.get_base64() + " xju-lab-managed"
    # Generated key only, never user-controlled shell text. Preserve existing keys.
    quoted = shlex.quote(public)
    command = ("umask 077; mkdir -p ~/.ssh && chmod 700 ~/.ssh && "
               "touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && "
               f"(grep -qxF -- {quoted} ~/.ssh/authorized_keys || printf '\\n%s\\n' {quoted} >> ~/.ssh/authorized_keys)")
    # Serialize installations from workers sharing the application key.
    with (state_dir() / "install.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        run_fixed(client, command)


DISCOVER = r'''set -eu
test "$(uname -s)" = Linux
printf 'OS\t'; (. /etc/os-release 2>/dev/null; printf '%s\n' "${PRETTY_NAME:-Linux}") || printf 'Linux\n'
printf 'CPU\t'; awk -F ': ' '/model name|Hardware/ {print $2; exit}' /proc/cpuinfo
printf 'CORES\t'; getconf _NPROCESSORS_ONLN
printf 'MEMORY\t'; awk '/MemTotal/ {printf "%.0f\n", $2*1024}' /proc/meminfo
printf 'DISK\t'; df -Pk / | awk 'NR==2 {printf "%.0f\n", $2*1024}'
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null | sed 's/^/GPU\t/' || true
fi
if test -d /sys/bus/pci/devices; then
  printf 'PCI\tavailable\n'
  for d in /sys/bus/pci/devices/*; do
    test -r "$d/class" || continue
    case "$(cat "$d/class")" in
      0x030*|0x038*) printf 'DISPLAY\t'; cat "$d/vendor" "$d/device" | tr '\n' ' '; printf '\n';;
    esac
  done
fi
'''


def hardware(text):
    fields, gpus, display = {}, [], []
    for line in text.splitlines():
        key, sep, value = line.partition("\t")
        if not sep:
            continue
        value = value.strip()[:240]
        if key == "GPU":
            gpus.append(value)
        elif key == "DISPLAY":
            display.append(value)
        else:
            fields[key] = value
    # ASPEED/Matrox virtual display controllers aren't compute GPUs.
    compute = [v for v in display if v.startswith(("0x10de ", "0x1002 ", "0x8086 "))]
    kind = "GPU" if gpus or compute else "CPU" if fields.get("PCI") == "available" and not display else "UNKNOWN"
    def number(k):
        return int(fields[k]) if fields.get(k, "").isdigit() else None
    return {"kind": kind, "os": fields.get("OS"), "cpuModel": fields.get("CPU") or None,
            "cpuCores": number("CORES"), "memoryBytes": number("MEMORY"), "diskBytes": number("DISK"),
            "gpus": gpus or compute, "gpuDetection": "NVIDIA_SMI" if gpus else "PCI" if compute else "NONE" if kind == "CPU" else "UNKNOWN"}


def connect(request):
    key = application_key()
    nodes = request["nodes"]
    transports = []

    def open_node(node, parent):
        sock = parent.open_channel("direct-tcpip", (node["host"], node["port"]), ("127.0.0.1", 0), timeout=10) if parent else socket.create_connection((node["host"], node["port"]), timeout=10)
        transport = paramiko.Transport(sock)
        transports.append(transport)
        transport.banner_timeout = 10
        transport.auth_timeout = 10
        transport.start_client(timeout=10)
        check_host(node, transport.get_remote_server_key(), request.get("approved", {}))
        return transport

    try:
        parent = None
        for index, node in enumerate(nodes):
            target = f"{node['user']}@{node['host']}:{node['port']}"
            client = open_node(node, parent)
            try:
                client.auth_publickey(node["user"], key)
                if not client.is_authenticated():
                    raise ValueError("服务器要求额外认证，暂不支持多因素 SSH 登录")
            except paramiko.AuthenticationException:
                client.close()
                password = request.get("password") if request.get("passwordTarget") == target else None
                if not password:
                    raise Challenge({"status": "PASSWORD_REQUIRED", "host": target, "message": "请输入此主机的 SSH 密码"})
                client = open_node(node, parent)
                try:
                    client.auth_password(node["user"], password, fallback=False)
                    if not client.is_authenticated():
                        raise ValueError("服务器要求额外认证，暂不支持多因素 SSH 登录")
                except paramiko.AuthenticationException:
                    raise Challenge({"status": "PASSWORD_REQUIRED", "host": target, "message": "密码认证失败，请重新输入；暂不支持多因素交互认证"}) from None
                install_key(client, key)
                client.close()
                client = open_node(node, parent)
                try:
                    client.auth_publickey(node["user"], key)
                    if not client.is_authenticated():
                        raise ValueError("公钥验证需要额外认证，暂不支持多因素 SSH 登录")
                except paramiko.AuthenticationException:
                    raise ValueError("公钥已追加，但免密登录验证失败，请检查服务器公钥登录策略") from None
            parent = client
        return {"status": "CONNECTED", "hardware": hardware(run_fixed(parent, DISCOVER)),
                "message": "连接成功，已验证公钥登录", "keyVerified": True}
    finally:
        for client in reversed(transports):
            client.close()


def main(request):
    action = request.get("action")
    if action == "catalog":
        config = Path(os.environ.get("LAB_SSH_CONFIG_FILE", "/app/ssh-config/config"))
        text = config.read_text() if config.is_file() else ""
        _, aliases, ignored = parse_config(text)
        # Reconstruct only supported connection directives; never return unrelated local options.
        blocks, _, _ = parse_config(text)
        safe_text = "\n".join("Host " + " ".join(b["patterns"]) + "\n" + "\n".join("  " + k + " " + v for k, v in b["options"].items()) for b in blocks)
        return {"config": safe_text, "aliases": aliases, "ignoredOptions": ignored}
    if action == "parse":
        _, aliases, ignored = parse_config(request.get("config", ""))
        return {"aliases": aliases, "ignoredOptions": ignored}
    if action == "resolve":
        return {"nodes": resolve(request["config"], request["alias"])}
    if action == "connect":
        return connect(request)
    raise ValueError("不支持的 SSH 操作")


if __name__ == "__main__":
    os.umask(0o077)
    try:
        result = main(json.loads(sys.stdin.buffer.read(65537)))
    except Challenge as ex:
        result = ex.payload
    except ValueError as ex:
        result = {"status": "FAILED", "message": str(ex)}
    except Exception:
        result = {"status": "FAILED", "message": "连接失败：请检查地址、网络、SSH 服务与写入权限后重试"}
    print(json.dumps(result, ensure_ascii=False))
