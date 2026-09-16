#!/usr/bin/env bash
# Host-installed release controller. Update deliberately with the administrator SSH key.
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
# Only Git archive content from main is accepted through the restricted SSH key.
tar xzf "$archive" -C "$release" --no-same-owner
cd "$root/deploy"
# Infrastructure and schema changes require a reviewed migration, never a reset.
for file in database/db_init.sql deploy/compose.yaml; do
  if ! diff --strip-trailing-cr -q "$root/$file" "$release/$file" >/dev/null; then
    echo "Deployment blocked: $file changed. Apply a reviewed migration/config update first." >&2
    exit 1
  fi
done
# Build before touching live services. Keep a stable rollback tag.
docker build -t "cashbook-backend:$sha" -f "$release/backend/Dockerfile" "$release"
docker build -t "cashbook-web:$sha" -f "$release/frontend/Dockerfile" "$release"
bash "$root/deploy/backup.sh"
docker tag cashbook-backend:latest cashbook-backend:rollback
docker tag cashbook-web:latest cashbook-web:rollback
rollback() {
  echo 'Deployment failed; restoring previous application images.' >&2
  docker tag cashbook-backend:rollback cashbook-backend:latest
  docker tag cashbook-web:rollback cashbook-web:latest
  docker compose up -d --no-build --force-recreate --wait --wait-timeout 120 backend web
}
trap rollback ERR
docker tag "cashbook-backend:$sha" cashbook-backend:latest
docker tag "cashbook-web:$sha" cashbook-web:latest
docker compose up -d --no-build --force-recreate --wait --wait-timeout 120 backend web
host=$(sed -n 's/^CASHBOOK_DOMAIN=//p' .env)
curl --fail --retry 5 --retry-delay 3 "https://$host/api/ready"
curl --fail --retry 3 --retry-delay 3 --output /dev/null "https://$host/login"
printf '%s\n' "$sha" > "$root/current-release"
trap - ERR
# Bound build cache growth; retain current and previous release images.
docker builder prune -f --filter until=168h >/dev/null
for image in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^cashbook-(backend|web):[a-f0-9]{40}$'); do
  case "$image" in *:"$sha") ;; *) docker image rm "$image" >/dev/null || true ;; esac
done
find "$root/releases" -mindepth 1 -maxdepth 1 -type d ! -name "$sha" -mtime +7 -exec rm -rf -- {} +
echo "Deployed $sha successfully. Previous images retained as :rollback."
