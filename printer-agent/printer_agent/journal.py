"""Durable local journal. It records submission intent before contacting CUPS."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path


class Journal:
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.path.parent, 0o700)
        self.db = sqlite3.connect(self.path, timeout=10, isolation_level="IMMEDIATE")
        os.chmod(self.path, 0o600) if self.path.exists() else None
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("""CREATE TABLE IF NOT EXISTS agent_job (
            job_id TEXT PRIMARY KEY, fencing_token INTEGER NOT NULL, version INTEGER NOT NULL,
            state TEXT NOT NULL, cups_job_id TEXT, content_sha256 TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        self.db.commit()
        os.chmod(self.path, 0o600)

    def get(self, job_id: str) -> dict | None:
        row = self.db.execute("SELECT job_id,fencing_token,version,state,cups_job_id,content_sha256 FROM agent_job WHERE job_id=?", (job_id,)).fetchone()
        if row is None:
            return None
        return dict(zip(("job_id", "fencing_token", "version", "state", "cups_job_id", "content_sha256"), row))

    def save(self, job_id: str, fencing_token: int, version: int, state: str, sha256: str, cups_job_id: str | None = None) -> None:
        with self.db:
            self.db.execute("""INSERT INTO agent_job(job_id,fencing_token,version,state,cups_job_id,content_sha256,updated_at)
                VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(job_id) DO UPDATE SET
                fencing_token=excluded.fencing_token,version=excluded.version,state=excluded.state,
                cups_job_id=COALESCE(excluded.cups_job_id,agent_job.cups_job_id),content_sha256=excluded.content_sha256,
                updated_at=CURRENT_TIMESTAMP""", (job_id, fencing_token, version, state, cups_job_id, sha256))

    def submitted(self) -> list[dict]:
        rows = self.db.execute("SELECT job_id,fencing_token,version,state,cups_job_id,content_sha256 FROM agent_job WHERE state='SUBMITTED'").fetchall()
        return [dict(zip(("job_id", "fencing_token", "version", "state", "cups_job_id", "content_sha256"), row)) for row in rows]

    def close(self) -> None:
        self.db.close()
