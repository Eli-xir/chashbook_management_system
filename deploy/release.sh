#!/usr/bin/env bash
set -Eeuo pipefail
sha=${1:?Commit SHA required}
archive=${2:?Archive required}
[[ $sha =~ ^[a-f0-9]{40}$ ]] || exit 2
exec 9>/var/lock/cashbook-operation.lock
flock -w 600 9
export CASHBOOK_LOCK_HELD=1
root=/opt/cashbook
release="$root/releases/$sha"
mkdir -p "$release"
tar xzf "$archive" -C "$release" --no-same-owner
cd "$root/deploy"
# Infrastructure remains pinned. Versioned schema migrations run after a backup.
for file in deploy/compose.yaml deploy/backup.sh deploy/release.sh deploy/ci-entrypoint.sh; do
  if ! diff --strip-trailing-cr -q "$root/$file" "$release/$file" >/dev/null; then
    echo "Deployment blocked: $file changed; install the reviewed migration/configuration first." >&2
    exit 1
  fi
done
docker build -t "cashbook-backend:$sha" -f "$release/backend/Dockerfile" "$release"
docker build -t "cashbook-web:$sha" -f "$release/frontend/Dockerfile" "$release"
docker tag cashbook-backend:latest cashbook-backend:rollback
docker tag cashbook-web:latest cashbook-web:rollback
previous=$(cat "$root/current-release")
migrated=0
recover() {
  trap - ERR
  if [[ $migrated == 0 ]]; then
    echo 'Backup or migration failed; restarting previous application. Migration transaction was not committed.' >&2
    docker tag cashbook-backend:rollback cashbook-backend:latest
    docker tag cashbook-web:rollback cashbook-web:latest
    docker compose up -d --no-build backend web
  else
    echo 'Migration committed, but rollout failed. Keeping the new schema and images; do not start an older backend against new data. Pre-migration backup is in S3.' >&2
  fi
  exit 1
}
trap recover ERR
# Stop writes before the dump and keep them stopped until migration commits.
docker compose stop backend
bash "$root/deploy/backup.sh"
docker tag "cashbook-backend:$sha" cashbook-backend:latest
docker tag "cashbook-web:$sha" cashbook-web:latest
docker compose run --rm --no-deps -T backend python -c 'from db import initialize; initialize(); print("Database migrations committed.")'
migrated=1
docker compose up -d --no-build --force-recreate --wait --wait-timeout 180 backend web
host=$(sed -n 's/^CASHBOOK_DOMAIN=//p' .env)
curl --fail --retry 5 --retry-delay 3 "https://$host/api/session"
curl --fail --retry 3 --retry-delay 3 --output /dev/null "https://$host/login"
install -m 644 "$release/database/db_init.sql" "$root/database/db_init.sql"
printf '%s\n' "$sha" > "$root/current-release"
trap - ERR
docker builder prune -f --filter until=168h >/dev/null
echo "Deployed $sha; previous application images retained as :rollback."
