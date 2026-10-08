CREATE TABLE hongqingting_batch (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by uuid NOT NULL REFERENCES member(id),
    idempotency_key uuid NOT NULL,
    student_no varchar(32) NOT NULL CHECK (student_no ~ '^[0-9]{5,32}$'),
    track varchar(40) NOT NULL CHECK (track = 'location_1_6km'),
    days integer NOT NULL CHECK (days BETWEEN 1 AND 90),
    daily_offset numeric NOT NULL CHECK (daily_offset BETWEEN -0.9 AND 0.9),
    status varchar(20) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED','RUNNING','COMPLETED','CANCELLED','FAILED','UNKNOWN')),
    version bigint NOT NULL DEFAULT 0,
    cancel_requested boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (created_by, idempotency_key)
);
CREATE UNIQUE INDEX hongqingting_one_active_student ON hongqingting_batch(student_no)
    WHERE status IN ('QUEUED','RUNNING');

-- Transactional outbox: intent is committed before the HTTP side effect.
-- SENDING is never retried; an expired attempt becomes UNKNOWN.
CREATE TABLE hongqingting_run (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES hongqingting_batch(id),
    ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 89),
    status varchar(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','SENDING','RECEIVED','FAILED','UNKNOWN','CANCELLED')),
    started_at timestamptz,
    finished_at timestamptz,
    message varchar(400),
    UNIQUE (batch_id, ordinal)
);
CREATE INDEX hongqingting_owner_history ON hongqingting_batch(created_by, created_at DESC);
CREATE INDEX hongqingting_sending ON hongqingting_run(started_at) WHERE status='SENDING';
