ALTER TABLE meeting ADD COLUMN location text NOT NULL DEFAULT '' CHECK (length(location) <= 500);
ALTER TABLE project ADD COLUMN resource_mode text NOT NULL DEFAULT 'GITHUB' CHECK (resource_mode IN ('GITHUB','BAIDU'));
ALTER TABLE project ADD COLUMN resource_links jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(resource_links) = 'object');
ALTER TABLE project ADD CONSTRAINT project_resource_keys CHECK (
    (resource_mode='GITHUB' AND resource_links - ARRAY['github','huggingFace'] = '{}'::jsonb)
    OR (resource_mode='BAIDU' AND resource_links - ARRAY['deliverables','sources','documents','video'] = '{}'::jsonb)
);

-- Small private attachments share the leave transaction and the database backup.
CREATE TABLE leave_attachment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES leave_application(id) ON DELETE CASCADE,
    filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
    byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
    content bytea NOT NULL CHECK (octet_length(content) = byte_size),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leave_attachment_application_idx ON leave_attachment(application_id,created_at,id);
