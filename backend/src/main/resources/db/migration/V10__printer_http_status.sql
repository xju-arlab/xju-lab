ALTER TABLE printer ADD COLUMN status_source text UNIQUE CHECK (status_source = 'HP_STATUS');
ALTER TABLE printer ADD COLUMN source_checked_at timestamptz;
ALTER TABLE printer ADD COLUMN source_observed_at timestamptz;
ALTER TABLE printer ADD COLUMN source_report jsonb;
