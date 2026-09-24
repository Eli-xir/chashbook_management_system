#!/usr/bin/env bash
# S3 media is immutable; a transactionally consistent PostgreSQL dump is sufficient.
set -Eeuo pipefail
cd "$(dirname "$(realpath "$0")")"
if [ "${CASHBOOK_LOCK_HELD:-0}" != 1 ]; then
  exec 9>/var/lock/cashbook-operation.lock
  flock -w 600 9
fi
umask 077
backup_tmp=$(mktemp -d)
trap 'rm -rf -- "$backup_tmp"' EXIT
backup_name="cashbook-v2-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T database pg_dump -U cashbook -d cashbook -Fc > "$backup_tmp/$backup_name"
docker compose run --rm --no-deps -T --user 0 -v "$backup_tmp:/backup:ro" backend python -c '
import os, sys
from storage import s3
name = sys.argv[1]
prefix = os.getenv("CASHBOOK_BACKUP_PREFIX", "pg_dump").strip("/")
s3().upload_file("/backup/" + name, os.environ["CASHBOOK_BACKUP_BUCKET"], prefix + "/" + name)
' "$backup_name"
echo "Uploaded $backup_name"
