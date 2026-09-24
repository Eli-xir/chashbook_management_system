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
# Infrastructure/schema changes need an explicit rollout, never an automatic reset.
for file in database/db_init.sql deploy/compose.yaml deploy/backup.sh deploy/release.sh deploy/ci-entrypoint.sh; do
  if ! diff --strip-trailing-cr -q "$root/$file" "$release/$file" >/dev/null; then
    echo "Deployment blocked: $file changed; install the reviewed migration/configuration first." >&2
    exit 1
  fi
done
docker build -t "cashbook-backend:$sha" -f "$release/backend/Dockerfile" "$release"
docker build -t "cashbook-web:$sha" -f "$release/frontend/Dockerfile" "$release"
bash "$root/deploy/backup.sh"
docker tag cashbook-backend:latest cashbook-backend:rollback
docker tag cashbook-web:latest cashbook-web:rollback
previous=$(cat "$root/current-release")
rollback() {
  trap - ERR
  echo 'Release failed; restoring previous application images.' >&2
  docker tag cashbook-backend:rollback cashbook-backend:latest
  docker tag cashbook-web:rollback cashbook-web:latest
  docker compose up -d --no-build --force-recreate --wait --wait-timeout 180 backend web
  printf '%s\n' "$previous" > "$root/current-release"
  exit 1
}
trap rollback ERR
docker tag "cashbook-backend:$sha" cashbook-backend:latest
docker tag "cashbook-web:$sha" cashbook-web:latest
docker compose up -d --no-build --force-recreate --wait --wait-timeout 180 backend web
host=$(sed -n 's/^CASHBOOK_DOMAIN=//p' .env)
curl --fail --retry 5 --retry-delay 3 "https://$host/api/session"
curl --fail --retry 3 --retry-delay 3 --output /dev/null "https://$host/login"
printf '%s\n' "$sha" > "$root/current-release"
trap - ERR
docker builder prune -f --filter until=168h >/dev/null
echo "Deployed $sha; previous application images retained as :rollback."
