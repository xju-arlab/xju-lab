ALTER TABLE print_job ADD COLUMN request_hash text NOT NULL DEFAULT '';
ALTER TABLE agent_identity ADD COLUMN last_report jsonb NOT NULL DEFAULT '{}';
ALTER TABLE printer ADD CONSTRAINT printer_agent_fk FOREIGN KEY (agent_id) REFERENCES agent_identity(id);

CREATE INDEX print_job_queue_idx ON print_job(printer_id,created_at,id) WHERE status IN ('QUEUED','LEASED');
CREATE INDEX print_job_owner_idx ON print_job(owner_id,created_at DESC,id);
CREATE INDEX print_event_job_idx ON print_event(job_id,created_at,id);
