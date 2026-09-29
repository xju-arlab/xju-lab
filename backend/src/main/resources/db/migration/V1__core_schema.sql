CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text UNIQUE,
  display_name text NOT NULL,
  direction text,
  cohort smallint,
  student_number text,
  contact text,
  introduction text,
  active boolean NOT NULL DEFAULT true,
  public_consent_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE external_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL REFERENCES member(id),
  issuer text NOT NULL, subject text NOT NULL, account_id text,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject), UNIQUE (issuer, account_id)
);
CREATE TABLE role_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL REFERENCES member(id),
  role text NOT NULL CHECK (role IN ('MEMBER','TEACHER','LAB_ADMIN','SUPER_ADMIN')),
  source text NOT NULL, granted_by uuid REFERENCES member(id), granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, version bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX role_assignment_active_unique ON role_assignment(member_id, role, source) WHERE revoked_at IS NULL;
CREATE TABLE mentor_relation (
  member_id uuid NOT NULL REFERENCES member(id), mentor_id uuid NOT NULL REFERENCES member(id),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (member_id, mentor_id), CHECK (member_id <> mentor_id)
);
CREATE TABLE lab_setting (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), name text NOT NULL, location text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai', description text NOT NULL DEFAULT '', mail_enabled boolean NOT NULL DEFAULT false,
  toner_alert_enabled boolean NOT NULL DEFAULT false, version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO lab_setting(singleton,name,location,timezone,description) VALUES (true,'算法与科研实验室','信息楼A411','Asia/Shanghai','');
CREATE TABLE admin_bootstrap (
  bootstrap_key text PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, location text NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX room_one_active_per_lab ON room((active)) WHERE active=true;
CREATE TABLE seat (
  id text PRIMARY KEY, room_id uuid NOT NULL REFERENCES room(id), kind text NOT NULL CHECK (kind IN ('seat','printer','table','facility')),
  layout_item jsonb NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE layout_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES room(id), version bigint NOT NULL,
  payload jsonb NOT NULL, actor_id uuid REFERENCES member(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(room_id,version)
);
CREATE TABLE seat_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seat_id text NOT NULL REFERENCES seat(id), member_id uuid NOT NULL REFERENCES member(id),
  assigned_by uuid REFERENCES member(id), assigned_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz,
  release_reason text
);
CREATE UNIQUE INDEX seat_assignment_active_seat ON seat_assignment(seat_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX seat_assignment_active_member ON seat_assignment(member_id) WHERE released_at IS NULL;

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')), lead_id uuid NOT NULL REFERENCES member(id),
  visibility text NOT NULL DEFAULT 'MEMBERS' CHECK (visibility IN ('MEMBERS','TEAM')), version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project_member (project_id uuid NOT NULL REFERENCES project(id), member_id uuid NOT NULL REFERENCES member(id), role text NOT NULL DEFAULT 'MEMBER', joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,member_id));
CREATE TABLE milestone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES project(id), title text NOT NULL,
  due_date date, completed_at timestamptz, version bigint NOT NULL DEFAULT 1
);
CREATE TABLE task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES project(id), title text NOT NULL,
  description text NOT NULL DEFAULT '', assignee_id uuid REFERENCES member(id), created_by uuid NOT NULL REFERENCES member(id),
  due_date date, status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','DONE','CANCELED')),
  version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE meeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES project(id), title text NOT NULL,
  starts_at timestamptz NOT NULL, created_by uuid NOT NULL REFERENCES member(id), version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE meeting_participant (meeting_id uuid NOT NULL REFERENCES meeting(id), member_id uuid NOT NULL REFERENCES member(id), PRIMARY KEY(meeting_id,member_id));
CREATE TABLE minutes_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid NOT NULL REFERENCES meeting(id), version bigint NOT NULL,
  body text NOT NULL, actor_id uuid NOT NULL REFERENCES member(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(meeting_id,version)
);
CREATE TABLE meeting_action_item (meeting_id uuid NOT NULL REFERENCES meeting(id), task_id uuid NOT NULL REFERENCES task(id), PRIMARY KEY(meeting_id,task_id));

CREATE TABLE leave_application (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL REFERENCES member(id), approver_id uuid NOT NULL REFERENCES member(id),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, reason text NOT NULL, status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','REVOKED')),
  version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at), CHECK (member_id <> approver_id)
);
ALTER TABLE leave_application ADD CONSTRAINT leave_no_active_overlap EXCLUDE USING gist
  (member_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('PENDING','APPROVED')) DEFERRABLE INITIALLY IMMEDIATE;
CREATE TABLE leave_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES leave_application(id),
  actor_id uuid NOT NULL REFERENCES member(id), decision text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE approval_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES leave_application(id),
  approver_id uuid NOT NULL REFERENCES member(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES member(id), storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL, mime_type text NOT NULL, byte_size bigint NOT NULL CHECK(byte_size > 0), page_count integer,
  sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id uuid NOT NULL REFERENCES member(id), kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}', read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL, aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL, available_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
  lease_owner text, lease_until timestamptz, delivered_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_event(available_at,created_at) WHERE delivered_at IS NULL;
CREATE TABLE audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES member(id), action text NOT NULL,
  target_type text NOT NULL, target_id text NOT NULL, before_summary jsonb, after_summary jsonb,
  request_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE idempotency_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES member(id), scope text NOT NULL,
  key text NOT NULL, request_hash text NOT NULL, response_status integer, response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, UNIQUE(actor_id,scope,key)
);

CREATE TABLE printer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, location text NOT NULL DEFAULT '', capabilities jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true, agent_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), printer_id uuid NOT NULL UNIQUE REFERENCES printer(id), token_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true, last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE print_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES member(id), printer_id uuid NOT NULL REFERENCES printer(id),
  file_id uuid NOT NULL REFERENCES file_object(id), options jsonb NOT NULL, status text NOT NULL DEFAULT 'QUEUED'
    CHECK(status IN ('QUEUED','LEASED','SUBMITTING','SUBMITTED','COMPLETED','FAILED','CANCEL_REQUESTED','CANCELED','UNKNOWN')),
  version bigint NOT NULL DEFAULT 1, lease_owner uuid, lease_until timestamptz, fencing_token bigint NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE print_event (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES print_job(id), status text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE server_asset (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, prometheus_job text, target_label text, gpu_supported boolean, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE alert_event (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid REFERENCES server_asset(id), fingerprint text NOT NULL, state text NOT NULL CHECK(state IN ('FIRING','RESOLVED')), payload jsonb NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(fingerprint,state));

CREATE TABLE training_term (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, starts_on date NOT NULL, ends_on date NOT NULL, active boolean NOT NULL DEFAULT false, CHECK(starts_on <= ends_on));
CREATE UNIQUE INDEX training_term_single_active ON training_term(active) WHERE active;
CREATE TABLE term_member (term_id uuid NOT NULL REFERENCES training_term(id), member_id uuid NOT NULL REFERENCES member(id), veteran boolean NOT NULL DEFAULT false, version bigint NOT NULL DEFAULT 1, PRIMARY KEY(term_id,member_id));
CREATE TABLE exam (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES training_term(id), title text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('WRITTEN','PRACTICAL')), starts_at timestamptz NOT NULL,
  rubric_snapshot jsonb NOT NULL, published_at timestamptz, version bigint NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES member(id)
);
CREATE TABLE grade_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), exam_id uuid NOT NULL REFERENCES exam(id), member_id uuid NOT NULL REFERENCES member(id),
  revision integer NOT NULL, score numeric(6,3), status text NOT NULL CHECK(status IN ('GRADED','PENDING','ABSENT','EXEMPT')),
  parts jsonb NOT NULL DEFAULT '{}', comment text, actor_id uuid NOT NULL REFERENCES member(id), reason text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(exam_id,member_id,revision)
);
CREATE INDEX grade_latest_idx ON grade_revision(exam_id,member_id,revision DESC);
CREATE TABLE contest_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES training_term(id), contest_id text NOT NULL,
  contest_url text NOT NULL, source_version text NOT NULL, payload_hash text NOT NULL, complete boolean NOT NULL DEFAULT false,
  ended_at timestamptz, imported_at timestamptz NOT NULL DEFAULT now(), UNIQUE(term_id,contest_id,payload_hash)
);
CREATE TABLE contest_result (
  snapshot_id uuid NOT NULL REFERENCES contest_snapshot(id), member_id uuid NOT NULL REFERENCES member(id), oj_user_id text NOT NULL,
  rank numeric(10,3) NOT NULL, solved integer NOT NULL, penalty bigint NOT NULL, PRIMARY KEY(snapshot_id,member_id), UNIQUE(snapshot_id,oj_user_id)
);
CREATE TABLE ranking_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES training_term(id), kind text NOT NULL,
  source_version text NOT NULL, algorithm_version text NOT NULL, payload jsonb NOT NULL, published_at timestamptz,
  calculated_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES member(id)
);
CREATE TABLE assessment_import_job (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES training_term(id), contest_url text NOT NULL, contest_id text NOT NULL, status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','WAITING_MAPPING','COMPLETED','FAILED')), result jsonb NOT NULL DEFAULT '{}', created_by uuid NOT NULL REFERENCES member(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE member_external_identity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL REFERENCES member(id), system text NOT NULL, external_id text NOT NULL, verified_at timestamptz, UNIQUE(system,external_id), UNIQUE(system,member_id));
CREATE TABLE external_role_sync (member_id uuid PRIMARY KEY REFERENCES member(id), desired boolean NOT NULL, version bigint NOT NULL DEFAULT 1, confirmed_version bigint NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'PENDING', updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE content_draft (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, slug text NOT NULL, content jsonb NOT NULL, version bigint NOT NULL DEFAULT 1, updated_by uuid NOT NULL REFERENCES member(id), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(kind,slug));
CREATE TABLE published_snapshot (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version bigint NOT NULL, payload jsonb NOT NULL, published_by uuid NOT NULL REFERENCES member(id), published_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz, UNIQUE(version));
