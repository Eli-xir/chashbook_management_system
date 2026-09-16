# Lightsail deployment

This directory prepares a single-server deployment. It does not provision AWS or claim a live deployment. See [CLIENT_CHECKLIST.md](CLIENT_CHECKLIST.md) for the exact access/inputs. Use the merged `main` branch.

## Architecture

Internet HTTPS -> Caddy (built React site and `/api` proxy) -> one FastAPI worker -> PostgreSQL. Only ports 80/443 are public. Attachments are in private S3; authorized backend requests issue a 60-second signed GET URL. A signed URL is a temporary bearer link; never log/share it. Uploads go through the authenticated backend with file validation.

PostgreSQL and JSON state live on persistent Docker volumes. The existing schema is unchanged. This is deliberately **one backend process on one server** because ID allocation and recovery/idempotency journals are local. Do not scale replicas/workers. A $7/1 GB Lightsail instance is a starting option for light use; measure memory, disk and load. Build images elsewhere or configure swap before building on 1 GB. Upgrade if monitoring shows pressure.

## Prepare server

1. Create Ubuntu Lightsail in Mumbai, attach static IPv4, allow inbound TCP80/443, and restrict SSH22 to the administrator's IP. Do not expose 5432 or 8000. Install Docker Engine and Compose from official Docker instructions. Enable OS security updates and time synchronization.
2. Clone this repository on the server (private repo: read-only deploy key). Check out `main`. Use a dedicated deployment user.
3. Point your domain's DNS A record to the static IP. Remove stale AAAA records unless IPv6 is actually configured.
4. Create/configure the two private S3 buckets and runtime IAM identity per checklist. Enable bucket versioning before use.
5. In `deploy/`, copy `.env.example` to `.env` and set domain/buckets/region. Generate a database password using `openssl rand -hex 32`. Keep that hex password; do not change POSTGRES_PASSWORD casually after DB initialization. Set `.env` mode600. Configure the private credentials file described in the checklist.

## First startup — fresh database only

Run from `deploy/`:

```bash
docker compose build
docker compose up -d database
docker compose run --rm backend python -m app.bootstrap
docker compose up -d
docker compose ps
curl --fail https://YOUR_DOMAIN/api/ready
```

Postgres executes `database/db_init.sql` only when its volume is empty. Bootstrap prompts for a first admin and seeds only the three roles, four transaction types, and Cash/Bank payment methods. **Do not run `app.seed` or `app.reset_dev` in production.** No local demo data or OTP keys are copied. Caddy obtains/renews TLS automatically after DNS and ports are correct. Camera and microphone require this HTTPS URL.

Before inviting users: verify admin sign-in, add one real user/head/permission, submit a transaction from a phone, view its attachment as admin, verify unauthenticated attachment access is denied, and run a backup/restore drill. SNS delivery remains unverified until an approved SMS account exists.

## Backups and restore

```bash
bash backup.sh
```

This briefly stops writes, exports a custom-format PostgreSQL dump and the corresponding state volume, resumes the backend, then uploads a timestamped archive to the private backup bucket. S3 attachments are protected separately by bucket versioning. The server runtime can append backups but cannot read/delete them. Schedule once daily off-hours using a systemd timer or cron, with failure notifications. Example cron (adjust absolute deployment path):

```cron
0 2 * * * cd /opt/cashbook/deploy && bash backup.sh >> /var/log/cashbook-backup.log 2>&1
```

Set up log rotation and alert on failure/missing daily backup; cron alone is not monitoring. Lightsail automatic snapshots are another paid recovery option, not a replacement for matched database/state backups.

Restore only to a separate empty recovery environment first. An administrator with S3 read access downloads/extracts an archive. Stop the target backend. Create an empty PostgreSQL database **without executing db_init.sql**, restore `database.dump` with `pg_restore --exit-on-error --no-owner`, and extract the matching `state.tar.gz` into its state volume owned by UID10001. Configure the corresponding media bucket; restore needed S3 object versions if files were deleted. Clear the restored `Sessions` table to invalidate old logins; remove restored OTP challenge/grant state and generate a fresh OTP key so old recovery codes cannot be replayed. Keep media/idempotency journals intact. Start one backend, verify data/files and permissions before switching DNS. Never overwrite a live database while rehearsing this.

## Updates

Back up before updating. Review schema migrations explicitly; `db_init.sql` is not an upgrade script. Pull main, run `docker compose build`, then `docker compose up -d`. Do not use `docker compose down -v`; that destroys persistent volumes. Keep the previous Git revision/image available for application rollback; a database rollback requires a reviewed restore plan.

## Current operational limits

- One server is a single point of failure; no automatic failover.
- Backups have not been restored on AWS yet; that is a deployment acceptance step.
- OTP can be disabled or use SNS; SMS approval, rates and delivery remain client setup.
- App throttles authentication attempts per client IP; proxy is the only public route. Do not expose backend ports or trust arbitrary direct forwarded headers.
- Production secure cookies and allowed HTTPS origin are mandatory. Local mock settings cannot be used as deployment settings.
- Historical Git commits contain old development OTP/test artifacts; those must never become production state. They are removed from the current tree and Docker context.

## Local validation completed

- 26 backend tests passed; 2 OTP/recovery tests intentionally deselected.
- React production build and both Docker image builds passed.
- Caddy configuration and backup shell syntax validated.
- Production backend container started with a disposable fresh database, non-root state storage and production settings; a second production writer was rejected.
- npm audit and pip-audit reported no known vulnerabilities in the checked dependency sets at preparation time.
- Real AWS bucket access, SMS delivery, public TLS and the backup/restore drill are still pending client access; these local checks do not substitute for them.
