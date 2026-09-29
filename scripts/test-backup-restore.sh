#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_RESTORE_TEST_CONFIRM:?Set BACKUP_RESTORE_TEST_CONFIRM=I_UNDERSTAND_THIS_USES_DISPOSABLE_LOCAL_TARGETS}"
[[ "$BACKUP_RESTORE_TEST_CONFIRM" == 'I_UNDERSTAND_THIS_USES_DISPOSABLE_LOCAL_TARGETS' ]] || {
  echo 'Backup/restore drill confirmation did not match.' >&2
  exit 2
}
: "${DATABASE_URL:?Set DATABASE_URL to a disposable local source database}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a separate disposable local target database}"
: "${S3_BUCKET:?Set S3_BUCKET to an empty disposable source bucket}"
: "${RESTORE_S3_BUCKET:?Set RESTORE_S3_BUCKET to a separate empty disposable target bucket}"
: "${BACKUP_ROOT:?Set BACKUP_ROOT to a protected directory outside this checkout}"
: "${AWS_ENDPOINT_URL:?Set AWS_ENDPOINT_URL to a local S3-compatible endpoint}"
command -v aws >/dev/null
command -v psql >/dev/null
command -v python3 >/dev/null

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$(realpath -m -- "$BACKUP_ROOT")"
case "$BACKUP_ROOT/" in
  "$ROOT/"*) echo 'BACKUP_ROOT must be outside the repository.' >&2; exit 2 ;;
esac

# Guard this destructive drill to loopback services and distinct databases/buckets.
python3 - "$DATABASE_URL" "$RESTORE_DATABASE_URL" "$AWS_ENDPOINT_URL" "$S3_BUCKET" "$RESTORE_S3_BUCKET" <<'PY'
import sys
from urllib.parse import unquote, urlsplit

source, target = (urlsplit(value) for value in sys.argv[1:3])
endpoint = urlsplit(sys.argv[3])
source_db = unquote(source.path.lstrip("/"))
target_db = unquote(target.path.lstrip("/"))
loopback = {"localhost", "127.0.0.1", "::1"}
if source.scheme not in {"postgres", "postgresql"} or target.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("Database URLs must use the PostgreSQL URL scheme.")
if source.hostname not in loopback or target.hostname not in loopback:
    raise SystemExit("The restore drill only accepts loopback PostgreSQL targets.")
if (source.hostname, source.port, source_db) == (target.hostname, target.port, target_db):
    raise SystemExit("Source and restore databases must be distinct.")
if endpoint.scheme != "http" or endpoint.hostname not in loopback:
    raise SystemExit("The restore drill only accepts a loopback HTTP S3 endpoint.")
if sys.argv[4] == sys.argv[5]:
    raise SystemExit("Source and restore buckets must be distinct.")
PY

aws_s3() { aws --endpoint-url "$AWS_ENDPOINT_URL" "$@"; }
aws_s3 s3api create-bucket --bucket "$S3_BUCKET" >/dev/null
aws_s3 s3api create-bucket --bucket "$RESTORE_S3_BUCKET" >/dev/null
for bucket in "$S3_BUCKET" "$RESTORE_S3_BUCKET"; do
  first_key="$(aws_s3 s3api list-objects-v2 --bucket "$bucket" --max-keys 1 --query 'Contents[0].Key' --output text)"
  [[ "$first_key" == 'None' || -z "$first_key" ]] || {
    echo "The disposable bucket $bucket must be empty before the drill." >&2
    exit 2
  }
done

probe_id="restore-$(date -u +%Y%m%dT%H%M%S)-$$"
object_key="backup-restore-probes/$probe_id/payload.txt"
stale_key="backup-restore-probes/$probe_id/stale-target-object.txt"
payload="xju-lab-backup-restore-probe:$probe_id"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/xju-lab-restore-drill.XXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT
printf '%s\n' "$payload" > "$work_dir/payload.txt"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v probe_id="$probe_id" -v object_key="$object_key" -v payload="$payload" <<'SQL'
CREATE TABLE IF NOT EXISTS xju_lab_backup_restore_probe (
    probe_id text PRIMARY KEY,
    object_key text NOT NULL,
    payload text NOT NULL
);
INSERT INTO xju_lab_backup_restore_probe (probe_id, object_key, payload)
VALUES (:'probe_id', :'object_key', :'payload');
SQL
aws_s3 s3 cp "$work_dir/payload.txt" "s3://$S3_BUCKET/$object_key" --only-show-errors

backup_output="$(bash "$ROOT/scripts/backup.sh")"
[[ "$backup_output" == 'Backup written to '* ]] || {
  echo 'Backup script did not report a completed backup directory.' >&2
  exit 1
}
BACKUP_DIR="${backup_output#Backup written to }"
[[ -f "$BACKUP_DIR/postgres.dump" && -f "$BACKUP_DIR/SHA256SUMS" ]] || {
  echo 'Backup output is incomplete.' >&2
  exit 1
}

# Prove the drill restores from the saved copy, not from the original source.
aws_s3 s3 rm "s3://$S3_BUCKET/$object_key" --only-show-errors
printf 'must be removed by exact restore\n' > "$work_dir/stale.txt"
aws_s3 s3 cp "$work_dir/stale.txt" "s3://$RESTORE_S3_BUCKET/$stale_key" --only-show-errors
RESTORE_CONFIRM=I_HAVE_VERIFIED_THE_TARGET_BEFORE_RESTORING \
  RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
  RESTORE_S3_BUCKET="$RESTORE_S3_BUCKET" \
  BACKUP_DIR="$BACKUP_DIR" \
  bash "$ROOT/scripts/restore.sh"

restored_record="$(psql "$RESTORE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -v probe_id="$probe_id" <<'SQL'
SELECT payload || '|' || object_key
FROM xju_lab_backup_restore_probe
WHERE probe_id = :'probe_id';
SQL
)"
[[ "$restored_record" == "$payload|$object_key" ]] || {
  echo 'Restored database row did not match its object reference.' >&2
  exit 1
}
aws_s3 s3 cp "s3://$RESTORE_S3_BUCKET/$object_key" "$work_dir/restored.txt" --only-show-errors
cmp -- "$work_dir/payload.txt" "$work_dir/restored.txt"
stale_after_restore="$(aws_s3 s3api list-objects-v2 --bucket "$RESTORE_S3_BUCKET" --prefix "$stale_key" --max-keys 1 --query 'Contents[0].Key' --output text)"
[[ "$stale_after_restore" == 'None' || -z "$stale_after_restore" ]] || {
  echo 'Restore left an object that was absent from the backup.' >&2
  exit 1
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v probe_id="$probe_id" <<'SQL'
DELETE FROM xju_lab_backup_restore_probe WHERE probe_id = :'probe_id';
SQL
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v probe_id="$probe_id" <<'SQL'
DELETE FROM xju_lab_backup_restore_probe WHERE probe_id = :'probe_id';
SQL
aws_s3 s3 rm "s3://$RESTORE_S3_BUCKET/$object_key" --only-show-errors
aws_s3 s3api delete-bucket --bucket "$S3_BUCKET"
aws_s3 s3api delete-bucket --bucket "$RESTORE_S3_BUCKET"
echo 'Isolated database and object-store backup/restore drill passed.'
