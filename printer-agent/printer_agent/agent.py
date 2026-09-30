"""Outbound status heartbeat loop for a locally configured printer."""
from __future__ import annotations

import logging
import time

from .api import ApiError

LOG = logging.getLogger("xju.printer_agent")


class PrinterAgent:
    def __init__(self, api, spooler, agent_version: str = "0.1.0", heartbeat_seconds: float = 30) -> None:
        self.api = api
        self.spooler = spooler
        self.agent_version = agent_version
        self.heartbeat_seconds = heartbeat_seconds
        self._last_heartbeat: float | None = None

    def run(self) -> None:
        delay = 1.0
        while True:
            try:
                self.run_once()
                delay = 1.0
            except ApiError as exc:
                LOG.warning("printer API unavailable status=%s", exc.status)
                time.sleep(delay)
                delay = min(delay * 2, 60)
            except Exception as exc:
                LOG.error("agent cycle failed error_type=%s", type(exc).__name__)
                time.sleep(delay)
                delay = min(delay * 2, 60)
            time.sleep(self.heartbeat_seconds)

    def run_once(self) -> None:
        if self._last_heartbeat is not None and time.monotonic() - self._last_heartbeat < self.heartbeat_seconds:
            return
        payload = {
            "agentVersion": self.agent_version,
            "deviceState": self.spooler.device_state(),
            "tonerSupported": False,
            "tonerPercent": None,
        }
        self.api.heartbeat(payload)
        self._last_heartbeat = time.monotonic()
