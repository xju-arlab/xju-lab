ALTER TABLE server_asset ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE external_role_sync ADD COLUMN last_error text;
ALTER TABLE external_role_sync ADD COLUMN confirmed_at timestamptz;
ALTER TABLE assessment_import_job ADD COLUMN idempotency_key text NOT NULL DEFAULT '';
ALTER TABLE assessment_import_job DROP CONSTRAINT assessment_import_job_status_check;
ALTER TABLE assessment_import_job ADD CONSTRAINT assessment_import_job_status_check CHECK(status IN ('QUEUED','RUNNING','WAITING_MAPPING','COMPLETED','NO_CHANGE','FAILED'));
ALTER TABLE alert_event DROP CONSTRAINT alert_event_fingerprint_state_key;

CREATE UNIQUE INDEX assessment_import_idempotency_idx ON assessment_import_job(created_by,term_id,idempotency_key) WHERE idempotency_key<>'';
CREATE INDEX assessment_import_queue_idx ON assessment_import_job(status,created_at) WHERE status='QUEUED';
CREATE INDEX alert_event_latest_idx ON alert_event(fingerprint,changed_at DESC,id);
