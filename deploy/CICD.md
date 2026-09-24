# GitHub Actions deployment

`.github/workflows/cashbook.yml` runs Python syntax checks, TypeScript/Vite production compilation and shell syntax checks. It does not run the application test suite. Main pushes and manual main runs deploy after checks pass; pull requests only run checks.

The `production` environment has variable DEPLOY_HOST and secrets DEPLOY_SSH_KEY and DEPLOY_KNOWN_HOSTS. The SSH key is restricted to `/usr/local/bin/cashbook-ci`; host verification stays enabled. No AWS or database credentials are sent to GitHub.

`/usr/local/sbin/cashbook-release` builds images from the exact commit, backs up PostgreSQL to S3, replaces backend/web, and checks HTTPS `/api/session` and `/login`. Failed startup/HTTP checks restore the previous application images. Database data is not rolled back. Releases are serialized, and superseded commits are skipped.

Schema, Compose, backup and privileged controller changes block automatic deployment until an administrator installs the reviewed configuration/migration. Stable infrastructure is `/opt/cashbook/deploy`, source snapshots are `/opt/cashbook/releases/<SHA>`, and `/opt/cashbook/current-release` records the active commit. Keep installed controllers synchronized with source deliberately.

Manual application rollback (does not reverse database changes):

```sh
cd /opt/cashbook/deploy
sudo flock /var/lock/cashbook-operation.lock bash -c 'docker tag cashbook-backend:rollback cashbook-backend:latest && docker tag cashbook-web:rollback cashbook-web:latest && docker compose up -d --no-build --force-recreate --wait backend web'
```

Check GitHub Actions for failed runs. The initial legacy database, configuration and images are retained separately for recovery. Periodically review disk usage and old release images; never prune database volumes blindly.
