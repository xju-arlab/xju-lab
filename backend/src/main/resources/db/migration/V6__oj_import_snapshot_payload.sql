ALTER TABLE contest_snapshot ADD COLUMN source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX contest_snapshot_latest_idx ON contest_snapshot(term_id,contest_id,imported_at DESC,id DESC) WHERE complete=true;
