"""Read-only CUPS status adapter; it never submits or cancels print jobs."""
from __future__ import annotations

import re
import subprocess


class CupsSpooler:
    def __init__(self, destination: str, lpstat: str = "/usr/bin/lpstat") -> None:
        if not destination or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", destination):
            raise ValueError("CUPS destination must be a local queue name")
        self.destination = destination
        self.lpstat = lpstat

    def device_state(self) -> str:
        try:
            result = subprocess.run([self.lpstat, "-p", self.destination], check=False,
                                    capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            return "UNKNOWN"
        text = (result.stdout + " " + result.stderr).lower()
        if result.returncode != 0:
            return "UNKNOWN"
        if "paper out" in text or "media empty" in text or "tray empty" in text:
            return "PAPER_OUT"
        if "jam" in text:
            return "JAMMED"
        if "disabled" in text or "stopped" in text:
            return "ERROR"
        if "printing" in text:
            return "BUSY"
        if "idle" in text or "enabled" in text:
            return "READY"
        return "UNKNOWN"
