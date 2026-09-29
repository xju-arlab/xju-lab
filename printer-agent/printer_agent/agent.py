"""Outbound polling loop with a crash-safe CUPS submission boundary."""
from __future__ import annotations

import hashlib
import logging
import os
import tempfile
import time
from pathlib import Path

from .api import ApiError

LOG = logging.getLogger("xju.printer_agent")


class PrinterAgent:
    def __init__(self, api, journal, spooler, data_dir: str, agent_version: str = "0.1.0", poll_seconds: float = 3, heartbeat_seconds: float = 30) -> None:
        self.api, self.journal, self.spooler = api, journal, spooler
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.data_dir, 0o700)
        self.agent_version, self.poll_seconds, self.heartbeat_seconds = agent_version, poll_seconds, heartbeat_seconds
        self._last_heartbeat = 0.0

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
            time.sleep(self.poll_seconds)

    def run_once(self) -> None:
        now = time.monotonic()
        if now - self._last_heartbeat >= self.heartbeat_seconds:
            self._send_heartbeat()
        self._monitor_submitted()
        response = self.api.poll()
        for cancel in response.get("cancelRequests", []):
            self._handle_cancel(cancel)
        job = response.get("job")
        if job:
            self._process(job)

    def _send_heartbeat(self) -> None:
        payload = {"agentVersion": self.agent_version, "deviceState": self.spooler.device_state(), "tonerSupported": False,
                   "tonerPercent": None, "capabilities": self.spooler.capabilities()}
        self.api.heartbeat(payload)
        self._last_heartbeat = time.monotonic()

    def _process(self, job: dict) -> None:
        job_id, fence = job["jobId"], int(job["fencingToken"])
        journal = self.journal.get(job_id)
        server = self._server_status(job_id, fence)
        if server is None:
            return
        if server["status"] in ("CANCEL_REQUESTED", "UNKNOWN", "FAILED", "COMPLETED", "CANCELED"):
            return
        title = "xju-" + job_id
        if server["status"] in ("SUBMITTING", "SUBMITTED"):
            cups_id = (journal or {}).get("cups_job_id") or self.spooler.find_by_title(title)
            if server["status"] == "SUBMITTING":
                if cups_id:
                    result = self._report(job_id, fence, server["version"], "SUBMITTED", {"cupsJobId": cups_id})
                    if result:
                        self.journal.save(job_id, fence, result["version"], "SUBMITTED", job["sha256"], cups_id)
                else:
                    self._report(job_id, fence, server["version"], "UNKNOWN", {"reasonCode": "SUBMISSION_OUTCOME_UNCERTAIN"})
                    self.journal.save(job_id, fence, server["version"], "UNKNOWN", job["sha256"])
            return
        if server["status"] != "LEASED":
            return
        local_path = self._download(job)
        self.journal.save(job_id, fence, server["version"], "SUBMITTING", job["sha256"])
        result = self._report(job_id, fence, server["version"], "SUBMITTING")
        if not result:
            return
        try:
            submission = self.spooler.submit(local_path, title, job["options"])
        except Exception as exc:
            LOG.warning("CUPS submission outcome unknown job=%s error_type=%s", job_id, type(exc).__name__)
            self.journal.save(job_id, fence, result["version"], "UNKNOWN", job["sha256"])
            self._report(job_id, fence, result["version"], "UNKNOWN", {"reasonCode": "CUPS_SUBMISSION_UNCERTAIN"})
            return
        self.journal.save(job_id, fence, result["version"], "SUBMITTED", job["sha256"], submission.cups_job_id)
        acknowledged = self._report(job_id, fence, result["version"], "SUBMITTED", {"cupsJobId": submission.cups_job_id})
        if acknowledged:
            self.journal.save(job_id, fence, acknowledged["version"], "SUBMITTED", job["sha256"], submission.cups_job_id)
        try:
            os.unlink(local_path)
        except OSError:
            pass

    def _download(self, job: dict) -> str:
        content = self.api.download(job["contentUrl"])
        if len(content) != int(job["byteSize"]) or not content.startswith(b"%PDF-"):
            raise ValueError("Downloaded print file is invalid")
        digest = hashlib.sha256(content).hexdigest()
        if digest != job["sha256"]:
            raise ValueError("Downloaded print file hash does not match")
        fd, path = tempfile.mkstemp(prefix="job-", suffix=".pdf", dir=self.data_dir)
        try:
            if hasattr(os, "fchmod"):
                os.fchmod(fd, 0o600)
            else:
                os.chmod(path, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        except Exception:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                os.unlink(path)
            except OSError:
                pass
            raise
        return path

    def _monitor_submitted(self) -> None:
        for row in self.journal.submitted():
            if not row["cups_job_id"]:
                continue
            state = self.spooler.state(row["cups_job_id"])
            if state == "ACTIVE":
                continue
            target = {"COMPLETED": "COMPLETED", "FAILED": "FAILED"}.get(state, "UNKNOWN")
            result = self._report(row["job_id"], row["fencing_token"], row["version"], target,
                                  {"cupsJobId": row["cups_job_id"], "reasonCode": "CUPS_RESULT_UNAVAILABLE"} if target == "UNKNOWN" else {"cupsJobId": row["cups_job_id"]})
            if result:
                self.journal.save(row["job_id"], row["fencing_token"], result["version"], target, row["content_sha256"], row["cups_job_id"])

    def _handle_cancel(self, request: dict) -> None:
        job_id, fence, version = request["jobId"], int(request["fencingToken"]), int(request["version"])
        row = self.journal.get(job_id)
        if row and row["cups_job_id"]:
            result = self.spooler.cancel(row["cups_job_id"])
        else:
            result = "CANCELED"
        if result == "CANCELED":
            target = "CANCELED"
            detail = {"cupsJobId": row["cups_job_id"]} if row and row["cups_job_id"] else None
        elif result == "COMPLETED":
            target = "COMPLETED"
            detail = {"cupsJobId": row["cups_job_id"]} if row and row["cups_job_id"] else None
        else:
            target = "UNKNOWN"
            detail = {"reasonCode": "CANCEL_RESULT_UNCERTAIN"}
            if row and row["cups_job_id"]:
                detail["cupsJobId"] = row["cups_job_id"]
        response = self._report(job_id, fence, version, target, detail)
        if response and row:
            self.journal.save(job_id, fence, response["version"], target,
                              row["content_sha256"], row["cups_job_id"])

    def _server_status(self, job_id: str, fence: int) -> dict | None:
        try:
            return self.api.job_status(job_id, fence)
        except ApiError as exc:
            if exc.status == 404:
                return None
            raise

    def _report(self, job_id: str, fence: int, version: int, state: str, detail: dict | None = None) -> dict | None:
        try:
            return self.api.update_status(job_id, state, fence, version, detail)
        except ApiError as exc:
            if exc.status == 409:
                LOG.info("stale printer update rejected job=%s state=%s", job_id, state)
                return None
            raise
