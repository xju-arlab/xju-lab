import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import paramiko
import lab_ssh


class ConfigTests(unittest.TestCase):
    def test_alias_defaults_jump_and_no_code_execution(self):
        config = "Host target\n HostName gpu.internal\n User lab\n ProxyJump jump\nHost jump\n HostName gateway.example\n User bastion\nHost *\n Port 2222\n IdentityFile ~/.ssh/personal\n"
        nodes = lab_ssh.resolve(config, "target")
        self.assertEqual([n['host'] for n in nodes], ['gateway.example', 'gpu.internal'])
        self.assertEqual([n['port'] for n in nodes], [2222, 2222])
        self.assertEqual(lab_ssh.parse_config(config)[2], ['identityfile'])
        for unsafe in ['ProxyCommand touch /tmp/evil', 'Match exec false', 'Include /etc/passwd', 'LocalCommand true', 'User $(id)']:
            with self.subTest(unsafe=unsafe), self.assertRaises(ValueError):
                lab_ssh.resolve('Host test\n HostName localhost\n ' + unsafe, 'test')

    def test_loops_bad_ports_missing_users_and_unresolved_jump(self):
        for config in ["Host a\n User lab\n ProxyJump a", "Host a\n User lab\n Port 0", "Host a\n HostName localhost", "Host a\n User lab\n ProxyJump unknown"]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                lab_ssh.resolve(config, 'a')

    def test_hardware_unknown_is_not_cpu(self):
        self.assertEqual(lab_ssh.hardware('OS\tLinux')['kind'], 'UNKNOWN')
        self.assertEqual(lab_ssh.hardware('PCI\tavailable\nCPU\tTest\nCORES\t4')['kind'], 'CPU')
        result = lab_ssh.hardware('GPU\tNVIDIA RTX 4090, 24564\nCORES\t16\nMEMORY\t34359738368')
        self.assertEqual(result['kind'], 'GPU')
        self.assertEqual(result['memoryBytes'], 34359738368)
        self.assertEqual(lab_ssh.hardware('PCI\tavailable\nDISPLAY\t0x1002 0x744c')['kind'], 'GPU')

    def test_host_key_requires_confirmation_and_blocks_changes(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, LAB_SSH_STATE_DIR=directory):
            key = paramiko.RSAKey.generate(2048)
            node = {'host': 'example.invalid', 'port': 22}
            with self.assertRaises(lab_ssh.Challenge) as first:
                lab_ssh.check_host(node, key, {})
            challenge = first.exception.payload
            self.assertEqual(challenge['status'], 'HOST_KEY_REQUIRED')
            lab_ssh.check_host(node, key, {challenge['host']: challenge['fingerprint']})
            lab_ssh.check_host(node, key, {})
            changed = paramiko.RSAKey.generate(2048)
            with self.assertRaises(lab_ssh.Challenge) as mismatch:
                lab_ssh.check_host(node, changed, {challenge['host']: lab_ssh.fingerprint(changed)})
            self.assertEqual(mismatch.exception.payload['status'], 'FAILED')


@unittest.skipUnless(os.environ.get('RUN_SSH_INTEGRATION') == '1', 'requires isolated OpenSSH containers')
class RealSshTests(unittest.TestCase):
    def test_password_bootstrap_jump_discovery_restart_and_idempotent_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'LAB_SSH_STATE_DIR': directory}
            nodes = [{'host': '127.0.0.1', 'port': 22221, 'user': 'lab', 'alias': 'jump'},
                     {'host': 'ssh-target', 'port': 22, 'user': 'lab', 'alias': 'target'}]
            request = {'action': 'connect', 'nodes': nodes, 'approved': {}}
            challenges = []

            def invoke():
                result = subprocess.run([sys.executable, str(Path(__file__).with_name('lab_ssh.py'))], input=json.dumps(request), text=True, capture_output=True, env=env, timeout=90, check=True)
                self.assertNotIn('lab-test-only', result.stdout + result.stderr)
                return json.loads(result.stdout)

            failed_password = False
            for _ in range(10):
                result = invoke()
                request.pop('password', None)
                challenges.append(result['status'])
                if result['status'] == 'HOST_KEY_REQUIRED':
                    request['approved'][result['host']] = result['fingerprint']
                elif result['status'] == 'PASSWORD_REQUIRED':
                    request['passwordTarget'] = result['host']
                    if not failed_password:
                        request['password'] = 'wrong-password'
                        self.assertEqual(invoke()['status'], 'PASSWORD_REQUIRED')
                        failed_password = True
                    request['password'] = 'lab-test-only'
                elif result['status'] == 'CONNECTED':
                    break
                else:
                    self.fail(str(result))
            self.assertEqual(result['status'], 'CONNECTED')
            self.assertTrue(result['keyVerified'])
            self.assertGreater(result['hardware']['cpuCores'], 0)
            self.assertGreater(result['hardware']['memoryBytes'], 0)
            self.assertEqual(challenges.count('HOST_KEY_REQUIRED'), 2)
            self.assertEqual(challenges.count('PASSWORD_REQUIRED'), 2)
            # New process, no password, persisted app key and host keys. Public key remains unique.
            request.pop('password', None)
            request['approved'] = {}
            self.assertEqual(invoke()['status'], 'CONNECTED')
            key = paramiko.RSAKey.from_private_key_file(str(Path(directory) / 'id_rsa'))
            for port in [22221, 22222]:
                client = paramiko.SSHClient()
                class ExactFixtureKey(paramiko.MissingHostKeyPolicy):
                    def missing_host_key(self, client, hostname, remote_key):
                        known = json.loads((Path(directory) / 'hosts.json').read_text())
                        if lab_ssh.fingerprint(remote_key) not in known.values():
                            raise ValueError('unexpected fixture key')
                client.set_missing_host_key_policy(ExactFixtureKey())
                try:
                    client.connect('127.0.0.1', port=port, username='lab', pkey=key, allow_agent=False, look_for_keys=False)
                    with patch.dict(os.environ, LAB_SSH_STATE_DIR=directory):
                        lab_ssh.install_key(client.get_transport(), key)
                    output = lab_ssh.run_fixed(client.get_transport(), 'cat ~/.ssh/authorized_keys')
                    self.assertEqual(output.count(key.get_base64()), 1)
                finally:
                    client.close()


if __name__ == '__main__':
    unittest.main()
