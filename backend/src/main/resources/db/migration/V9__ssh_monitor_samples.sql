CREATE TABLE server_metric_sample (
    asset_id uuid NOT NULL REFERENCES server_asset(id) ON DELETE CASCADE,
    sampled_at timestamptz NOT NULL DEFAULT now(),
    state text NOT NULL CHECK (state IN ('CONNECTED','SSH_UNAVAILABLE')),
    metrics jsonb NOT NULL DEFAULT '[]',
    PRIMARY KEY (asset_id, sampled_at)
);
CREATE INDEX server_metric_sample_retention ON server_metric_sample(sampled_at);
