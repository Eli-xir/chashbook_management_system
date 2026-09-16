#!/usr/bin/env bash
# Stop the single writer briefly so PostgreSQL and the JSON journals match.
set -Eeuo pipefail
cd "$(dirname "$(realpath "$0")")"
umask 077
backup_tmp=$(mktemp -d)
resume_needed=0
cleanup() {
  if [ "$resume_needed" = 1 ]; then docker compose start backend; fi
  rm -rf -- "$backup_tmp"
}
trap cleanup EXIT
resume_needed=1
docker compose stop backend
docker compose exec -T database pg_dump -U cashbook -d cashbook -Fc > "$backup_tmp/database.dump"
docker compose run --rm --no-deps -T --user 0 --entrypoint tar backend czf - -C /state . > "$backup_tmp/state.tar.gz"
docker compose start backend
resume_needed=0
backup_name="cashbook-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar czf "$backup_tmp/$backup_name" -C "$backup_tmp" database.dump state.tar.gz
docker compose run --rm --no-deps -T -v "$backup_tmp:/backup:ro" --user 0 backend python -m app.backup_upload "/backup/$backup_name"
echo "Uploaded $backup_name. Check the exit status/log for scheduled backups."
