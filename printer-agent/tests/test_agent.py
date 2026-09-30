from __future__ import annotations

import unittest

from printer_agent.agent import PrinterAgent
from printer_agent.api import ApiError
from printer_agent.spooler import CupsSpooler


class FakeApi:
    def __init__(self):
        self.reports = []

    def heartbeat(self, payload):
        self.reports.append(payload)
        return {"status": "OK"}


class FakeSpooler:
    def __init__(self, state="READY"):
        self.state = state
        self.reads = 0

    def device_state(self):
        self.reads += 1
        return self.state


class PrinterStatusAgentTests(unittest.TestCase):
    def test_reports_agent_and_device_status(self):
        api, spooler = FakeApi(), FakeSpooler("BUSY")
        agent = PrinterAgent(api, spooler, agent_version="0.2.0", heartbeat_seconds=30)

        agent.run_once()

        self.assertEqual(api.reports, [{
            "agentVersion": "0.2.0",
            "deviceState": "BUSY",
            "tonerSupported": False,
            "tonerPercent": None,
        }])
        self.assertEqual(spooler.reads, 1)

    def test_does_not_send_heartbeat_before_interval(self):
        api, spooler = FakeApi(), FakeSpooler()
        agent = PrinterAgent(api, spooler, heartbeat_seconds=3600)
        agent._last_heartbeat = __import__("time").monotonic()

        agent.run_once()

        self.assertEqual(api.reports, [])
        self.assertEqual(spooler.reads, 0)

    def test_failed_heartbeat_remains_due_for_retry(self):
        class BrokenApi:
            def heartbeat(self, _payload):
                raise ApiError(503)

        agent = PrinterAgent(BrokenApi(), FakeSpooler())
        with self.assertRaises(ApiError):
            agent.run_once()
        self.assertIsNone(agent._last_heartbeat)

    def test_invalid_cups_destination_is_rejected(self):
        with self.assertRaises(ValueError):
            CupsSpooler("../remote-printer")


if __name__ == "__main__":
    unittest.main()
