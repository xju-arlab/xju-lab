ALTER TABLE contest_snapshot ADD COLUMN event_order integer NOT NULL DEFAULT 1 CHECK (event_order > 0);
ALTER TABLE exam ADD COLUMN event_order integer NOT NULL DEFAULT 1 CHECK (event_order > 0);
ALTER TABLE contest_snapshot ADD COLUMN title text NOT NULL DEFAULT '';
ALTER TABLE training_term ADD COLUMN version bigint NOT NULL DEFAULT 1;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY term_id, starts_at ORDER BY id) AS ordinal
  FROM exam
)
UPDATE exam SET event_order=ordered.ordinal FROM ordered WHERE exam.id=ordered.id;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY term_id, ended_at ORDER BY imported_at, id) AS ordinal
  FROM contest_snapshot WHERE complete=true AND ended_at IS NOT NULL
)
UPDATE contest_snapshot SET event_order=ordered.ordinal FROM ordered WHERE contest_snapshot.id=ordered.id;

CREATE UNIQUE INDEX contest_snapshot_time_order_unique ON contest_snapshot(term_id,ended_at,event_order) WHERE complete=true AND ended_at IS NOT NULL;
CREATE UNIQUE INDEX exam_time_order_unique ON exam(term_id,starts_at,event_order);
