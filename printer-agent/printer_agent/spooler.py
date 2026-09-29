"""CUPS command adapter. The queue name is local configuration, never server input."""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass


@dataclass(frozen=True)
class Submission:
    cups_job_id: str


class CupsSpooler:
    def __init__(self, destination: str, lp: str = "/usr/bin/lp", lpstat: str = "/usr/bin/lpstat", cancel: str = "/usr/bin/cancel") -> None:
        if not destination or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", destination):
            raise ValueError("CUPS destination must be a local queue name")
        self.destination = destination
        self.lp = lp
        self.lpstat = lpstat
        self.cancel_cmd = cancel

    def submit(self, path: str, title: str, options: dict) -> Submission:
        command = [self.lp, "-d", self.destination, "-t", title, "-n", str(options["copies"])]
        sides = {"SIMPLEX": "one-sided", "DUPLEX_LONG_EDGE": "two-sided-long-edge", "DUPLEX_SHORT_EDGE": "two-sided-short-edge"}[options["sides"]]
        command += ["-o", "sides=" + sides]
        command += ["-o", "ColorModel=" + ("RGB" if options["color"] == "COLOR" else "Gray")]
        if options.get("pages"):
            command += ["-P", ",".join(str(value) for value in options["pages"])]
        command.append(path)
        result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            raise RuntimeError("CUPS submission result is uncertain")
        match = re.search(r"request id is ([A-Za-z0-9_.-]+)", result.stdout + " " + result.stderr, re.IGNORECASE)
        if not match:
            raise RuntimeError("CUPS accepted or may have accepted the job without returning an id")
        return Submission(match.group(1))

    def find_by_title(self, title: str) -> str | None:
        output = self._run([self.lpstat, "-W", "not-completed", "-l", "-o", self.destination])
        for block in re.split(r"\n(?=[A-Za-z0-9_.-]+-[0-9]+\s)", output):
            if title in block:
                first = block.splitlines()[0].split()[0]
                return first
        return None

    def state(self, cups_job_id: str) -> str:
        active = self._run([self.lpstat, "-W", "not-completed", "-o", self.destination])
        if re.search(r"(?m)^" + re.escape(cups_job_id) + r"\s", active):
            return "ACTIVE"
        completed = self._run([self.lpstat, "-W", "completed", "-l", "-o", self.destination])
        block = next((part for part in re.split(r"\n(?=[A-Za-z0-9_.-]+-[0-9]+\s)", completed) if part.startswith(cups_job_id + " ")), "")
        if block:
            if re.search(r"(?i)aborted|stopped|cancelled|canceled|failed", block):
                return "FAILED"
            return "COMPLETED"
        return "UNKNOWN"

    def cancel(self, cups_job_id: str) -> str:
        state = self.state(cups_job_id)
        if state != "ACTIVE":
            return state
        result = subprocess.run([self.cancel_cmd, cups_job_id], check=False, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return "UNKNOWN"
        return "CANCELED" if self.state(cups_job_id) != "ACTIVE" else "UNKNOWN"

    def device_state(self) -> str:
        result = subprocess.run([self.lpstat, "-p", self.destination], check=False, capture_output=True, text=True, timeout=20)
        text = (result.stdout + " " + result.stderr).lower()
        if result.returncode != 0:
            return "UNKNOWN"
        if "disabled" in text or "stopped" in text:
            return "ERROR"
        if "printing" in text:
            return "BUSY"
        if "idle" in text or "enabled" in text:
            return "READY"
        return "UNKNOWN"

    def capabilities(self) -> dict:
        result = subprocess.run(["/usr/bin/lpoptions", "-p", self.destination, "-l"], check=False, capture_output=True, text=True, timeout=20)
        if result.returncode != 0 or not result.stdout.strip():
            return {"known": False, "colorSupported": False, "duplexSupported": False, "maxCopies": 1, "paperSizes": []}
        text = result.stdout
        color = bool(re.search(r"(?im)^ColorModel/.*\b(?:RGB|CMYK|Color)\b", text))
        duplex = bool(re.search(r"(?im)^Duplex/.*\b(?:None|NoTumble|Tumble)\b", text))
        media_match = re.search(r"(?im)^PageSize/[^:]*:\s*(.+)$", text)
        papers = re.findall(r"\b[A-Z][A-Z0-9]{1,8}\b", media_match.group(1))[:20] if media_match else []
        copy_match = re.search(r"(?im)^Copies/[^:]*:\s*(.+)$", text)
        max_copies = max((int(value) for value in re.findall(r"\b\d+\b", copy_match.group(1))) if copy_match else [1])
        return {"known": True, "colorSupported": color, "duplexSupported": duplex, "maxCopies": min(20, max(1, max_copies)), "paperSizes": papers}

    @staticmethod
    def _run(command: list[str]) -> str:
        result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=20)
        if result.returncode != 0:
            return ""
        return result.stdout
