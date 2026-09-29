#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DIR:?Set BACKUP_DIR to a verified backup directory}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to the approved restore target}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM=I_HAVE_VERIFIED_THE_TARGET_BEFORE_RESTORING}"
[[ "$RESTORE_CONFIRM" == 'I_HAVE_VERIFIED_THE_TARGET_BEFORE_RESTORING' ]] || {
  echo 'Restore confirmation did not match.' >&2; exit 2;
}
[[ -f "$BACKUP_DIR/postgres.dump" && -f "$BACKUP_DIR/SHA256SUMS" ]] || {
  echo 'Backup is missing postgres.dump or SHA256SUMS.' >&2; exit 2;
}
command -v pg_restore >/dev/null
command -v aws >/dev/null

(cd "$BACKUP_DIR" && sha256sum --check SHA256SUMS)
pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" "$BACKUP_DIR/postgres.dump"

if [[ -n "${RESTORE_S3_BUCKET:-}" ]]; then
  aws_args=()
  if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then aws_args+=(--endpoint-url "$AWS_ENDPOINT_URL"); fi
  # Make the restored bucket reflect the backup exactly. The caller must set
  # RESTORE_S3_BUCKET explicitly; this can remove objects absent from backup.
  aws s3 sync "$BACKUP_DIR/objects/" "s3://$RESTORE_S3_BUCKET/" "${aws_args[@]}" --delete --only-show-errors
fi
echo 'Database restore completed. Object restore runs only when RESTORE_S3_BUCKET is set.'
