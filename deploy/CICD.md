# CI/CD and client account setup

GitHub Actions workflow: `.github/workflows/cashbook.yml`.
Pushes to main and the three development branches run all backend tests using disposable PostgreSQL 17, then TypeScript checks and a Vite production build. Pull requests targeting main run the same checks. OTP tests use mocks; no SMS is sent.
Only passing main runs deploy. The production environment permits main only, uses a dedicated SSH key restricted to the deployment command, and pins the SSH host key. Actions are pinned to commit hashes. No AWS credentials or database passwords are in GitHub.

Deployment builds images on Lightsail, takes an S3 backup, replaces the containers, checks HTTPS readiness and frontend, and restores previous application images if startup or health checks fail. There is a brief interruption. Database data and persistent journals are not rolled back. Schema/Compose changes block automatic deployment and need an explicit migration/configuration rollout. No database reset is ever run by CI/CD.

The server controller is `/usr/local/sbin/cashbook-release`; its source is `deploy/release.sh`. The forced SSH entrypoint is `/usr/local/bin/cashbook-ci`. Changes to these privileged controllers require an administrator to install them deliberately. The server's `/opt/cashbook/current-release` records the successful commit. Source for that commit is in `/opt/cashbook/releases/<SHA>`; `/opt/cashbook/deploy` remains the stable infrastructure configuration. Do not build from the initial source copy for future releases.
Backup and deployment share an exclusive lock. A failed backup blocks deployment. Current and previous application images are retained, and old build cache/release directories are bounded. Run failures appear in GitHub Actions; enable GitHub notification preferences for failed runs.

## Manual rollback

On the server:

```sh
cd /opt/cashbook/deploy
sudo flock /var/lock/cashbook-operation.lock bash -c 'docker tag cashbook-backend:rollback cashbook-backend:latest && docker tag cashbook-web:rollback cashbook-web:latest && docker compose up -d --no-build --force-recreate --wait backend web'
```

This restores application code only. Investigate the failing commit before pushing again. It does not undo transactions made after deployment.

## Reproduce for the client's account

1. Create Ubuntu Lightsail (Mumbai is the current choice), attach a static IPv4 address, and allow TCP 80/443 plus SSH access for administration and GitHub-hosted runners. A domain is optional. Keep port 80 open for certificate renewal.
2. Install Docker/Compose, provision swap on a 1 GiB server, transfer the repository and follow `README.md` in this directory to initialize the fresh database and bootstrap an admin. If real client data exists here by then, perform a deliberate backup/restore migration instead of initializing empty.
3. Create the client's own private S3 bucket (names must be globally unique). Enable Block Public Access, encryption and versioning; set retention appropriate to the client. Mumbai storage avoids the current cross-region Mumbai-to-Singapore path. Create a dedicated IAM user with the restricted policy, replacing bucket ARNs with the new bucket. Never reuse this account's IAM key.
4. In the new server's `deploy/.env`, set `CASHBOOK_DOMAIN` to its new IP, a NEW random database password, the bucket's actual AWS region, bucket names and media/backup prefixes. Leave SMS disabled until configured. Install the new IAM credentials privately in `deploy/secrets/aws_credentials`, owner 10001:10001, mode 400. The same bucket can hold attachments and backups under separate prefixes.
5. Install `cashbook-backup.service` and `.timer` in `/etc/systemd/system/`, reload systemd and enable the timer. Test uploads, privacy, backup and restore before handover.
6. Install `ci-entrypoint.sh` and `release.sh` at the host paths above, root-owned mode 755. Generate a NEW deployment SSH key. Add its public key to ubuntu's authorized_keys with `restrict,command="/usr/local/bin/cashbook-ci"` before the key. Keep a separate administrator SSH key.
7. In the client's GitHub repository (or the production environment of this repository), configure environment `production` for main only. Set variable `DEPLOY_HOST` to the new IP. Set secrets `DEPLOY_SSH_KEY` to the dedicated private key and `DEPLOY_KNOWN_HOSTS` to the verified host-key entry. Change these together when cutting over. Never disable host verification to fix an IP change.
8. Push or manually run the workflow on main and verify a complete successful deployment. This pipeline targets one production environment; switching its settings stops deployment to the old server. Remove old keys/resources after the client confirms cutover.

Frontend and backend are same-origin on Lightsail: no Vercel settings are needed. S3 keys are generated at runtime, so source code need not hardcode the client's IP or bucket. The example IAM policy and instance documentation contain this account's bucket name and should be adapted. The client will also need their own SMS provider setup for OTP if enabled later.
