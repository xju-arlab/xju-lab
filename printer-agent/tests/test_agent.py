from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from printer_agent.agent import PrinterAgent
from printer_agent.journal import Journal
from printer_agent.spooler import Submission


PDF = b"%PDF-1.4\nminimal test fixture\n"
JOB_ID = "12345678-1234-1234-1234-123456789abc"


class FakeApi:
    def __init__(self, status="LEASED", version=2):
        self.status = status
        self.version = version
        self.updates = []

    def job_status(self, job_id, fencing_token):
        return {"jobId": job_id, "status": self.status, "version": self.version, "fencingToken": fencing_token}

    def download(self, _url):
        return PDF

    def update_status(self, job_id, state, fencing_token, version, detail=None):
        if version != self.version:
            raise AssertionError("agent used a stale version")
        self.status = state
        self.version += 1
        self.updates.append((state, detail or {}))
        return {"jobId": job_id, "state": state, "version": self.version}


class FakeSpooler:
    def __init__(self, *, uncertain=False, found=None, state="ACTIVE"):
        self.uncertain = uncertain
        self.found = found
        self.cups_state = state
        self.submissions = 0

    def submit(self, _path, _title, _options):
        self.submissions += 1
        if self.uncertain:
            raise RuntimeError("simulated lost CUPS acknowledgement")
        return Submission("test-printer-42")

    def find_by_title(self, _title):
        return self.found

    def state(self, _job):
        return self.cups_state

    def cancel(self, _job):
        return "CANCELED"

    def device_state(self):
        return "UNKNOWN"

    def capabilities(self):
        return {"known": False, "colorSupported": False, "duplexSupported": False, "maxCopies": 1, "paperSizes": []}


def server_job():
    return {"jobId": JOB_ID, "version": 2, "fencingToken": 5, "leaseUntil": "2026-09-29T20:00:00Z",
            "contentUrl": "/api/v1/printer-agent/jobs/test/content?fencingToken=5", "sha256": hashlib.sha256(PDF).hexdigest(),
            "byteSize": len(PDF), "pageCount": 1,
            "options": {"pages": [1], "copies": 1, "sides": "SIMPLEX", "color": "MONOCHROME", "estimatedSheets": 1}}


class AgentRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.journal = Journal(str(self.root / "journal.sqlite3"))

    def tearDown(self):
        self.journal.close()
        self.temp.cleanup()

    def test_records_submission_before_cups_and_persists_cups_id(self):
        api, spooler = FakeApi(), FakeSpooler()
        agent = PrinterAgent(api, self.journal, spooler, str(self.root / "data"))
        agent._process(server_job())
        row = self.journal.get(JOB_ID)
        self.assertEqual(spooler.submissions, 1)
        self.assertEqual([state for state, _ in api.updates], ["SUBMITTING", "SUBMITTED"])
        self.assertEqual(row["state"], "SUBMITTED")
        self.assertEqual(row["cups_job_id"], "test-printer-42")
        self.assertEqual(row["version"], 4)

    def test_uncertain_cups_result_is_unknown_and_never_resubmitted(self):
        api, spooler = FakeApi(), FakeSpooler(uncertain=True)
        agent = PrinterAgent(api, self.journal, spooler, str(self.root / "data"))
        agent._process(server_job())
        self.assertEqual(spooler.submissions, 1)
        self.assertEqual(api.status, "UNKNOWN")
        self.assertEqual(self.journal.get(JOB_ID)["state"], "UNKNOWN")

    def test_recovery_never_repeats_submission_without_cups_evidence(self):
        api, spooler = FakeApi(status="SUBMITTING", version=3), FakeSpooler(found=None)
        self.journal.save(JOB_ID, 5, 3, "SUBMITTING", hashlib.sha256(PDF).hexdigest())
        agent = PrinterAgent(api, self.journal, spooler, str(self.root / "data"))
        agent._process(server_job())
        self.assertEqual(spooler.submissions, 0)
        self.assertEqual(api.status, "UNKNOWN")

    def test_known_cups_title_recovers_a_lost_submission_response(self):
        api, spooler = FakeApi(status="SUBMITTING", version=3), FakeSpooler(found="test-printer-42")
        self.journal.save(JOB_ID, 5, 3, "SUBMITTING", hashlib.sha256(PDF).hexdigest())
        agent = PrinterAgent(api, self.journal, spooler, str(self.root / "data"))
        agent._process(server_job())
        self.assertEqual(spooler.submissions, 0)
        self.assertEqual(api.status, "SUBMITTED")
        self.assertEqual(self.journal.get(JOB_ID)["cups_job_id"], "test-printer-42")

    def test_cancel_persists_terminal_server_state_in_local_journal(self):
        api, spooler = FakeApi(status="CANCEL_REQUESTED", version=4), FakeSpooler()
        sha = hashlib.sha256(PDF).hexdigest()
        self.journal.save(JOB_ID, 5, 4, "SUBMITTED", sha, "test-printer-42")
        agent = PrinterAgent(api, self.journal, spooler, str(self.root / "data"))

        agent._handle_cancel({"jobId": JOB_ID, "fencingToken": 5, "version": 4})

        row = self.journal.get(JOB_ID)
        self.assertEqual(api.status, "CANCELED")
        self.assertEqual(row["state"], "CANCELED")
        self.assertEqual(row["version"], 5)
        self.assertEqual(row["cups_job_id"], "test-printer-42")


if __name__ == "__main__":
    unittest.main()
