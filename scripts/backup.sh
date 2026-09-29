#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the PostgreSQL source database}"
: "${S3_BUCKET:?Set S3_BUCKET to the private object bucket}"
: "${BACKUP_ROOT:?Set BACKUP_ROOT to a protected directory outside this checkout}"
command -v pg_dump >/dev/null
command -v aws >/dev/null

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$(realpath -m -- "$BACKUP_ROOT")"
case "$BACKUP_ROOT/" in
  "$ROOT/"*) echo 'BACKUP_ROOT must be outside the repository.' >&2; exit 2 ;;
esac

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$BACKUP_ROOT/xju-lab-$stamp"
mkdir -p -- "$backup_dir/objects"
chmod 700 -- "$backup_dir" "$backup_dir/objects"

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$backup_dir/postgres.dump"
aws_args=()
if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then aws_args+=(--endpoint-url "$AWS_ENDPOINT_URL"); fi
aws s3 sync "s3://$S3_BUCKET/" "$backup_dir/objects/" "${aws_args[@]}" --only-show-errors
(
  cd "$backup_dir"
  sha256sum postgres.dump > SHA256SUMS
  find objects -type f -print0 | sort -z | xargs -0 -r sha256sum >> SHA256SUMS
)
chmod 600 -- "$backup_dir/postgres.dump" "$backup_dir/SHA256SUMS"
echo "Backup written to $backup_dir"
