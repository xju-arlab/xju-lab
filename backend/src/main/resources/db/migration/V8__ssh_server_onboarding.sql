ALTER TABLE server_asset ADD COLUMN hardware jsonb;
ALTER TABLE server_asset ADD COLUMN ssh_connection jsonb;
ALTER TABLE server_asset ADD COLUMN discovered_at timestamptz;
CREATE UNIQUE INDEX server_asset_ssh_target_unique ON server_asset ((ssh_connection->>'identity')) WHERE ssh_connection IS NOT NULL;

CREATE TABLE server_connection_draft (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES member(id),
    name text NOT NULL,
    nodes jsonb NOT NULL,
    approved jsonb NOT NULL DEFAULT '{}',
    result jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','RUNNING','HOST_KEY_REQUIRED','PASSWORD_REQUIRED','CONNECTED','FAILED','CANCELLED','SAVED')),
    asset_id uuid REFERENCES server_asset(id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX server_connection_draft_expiry ON server_connection_draft(expires_at);
