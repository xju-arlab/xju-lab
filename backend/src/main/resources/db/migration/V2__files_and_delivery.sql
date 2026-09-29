ALTER TABLE member ADD COLUMN notification_email text;
ALTER TABLE member ADD COLUMN notification_email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE member ADD CONSTRAINT member_verified_notification_email CHECK (NOT notification_email_verified OR notification_email IS NOT NULL);

ALTER TABLE outbox_event ADD COLUMN dead_lettered_at timestamptz;
CREATE INDEX notification_unread_idx ON notification(recipient_id,created_at DESC) WHERE read_at IS NULL;
ALTER TABLE file_object ADD COLUMN object_purged_at timestamptz;
