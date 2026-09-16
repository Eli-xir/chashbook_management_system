#!/usr/bin/env bash
set -Eeuo pipefail
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
  echo 'Only deploy <commit SHA> is permitted.' >&2
  exit 1
fi
sha=${BASH_REMATCH[1]}
umask 077
mkdir -p /opt/cashbook/incoming
archive=$(mktemp /opt/cashbook/incoming/release-XXXXXXXX.tar.gz)
trap 'rm -f "$archive"' EXIT
cat > "$archive"
sudo /usr/local/sbin/cashbook-release "$sha" "$archive"
