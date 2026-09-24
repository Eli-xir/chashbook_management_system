# Production deployment

One Lightsail server runs Caddy, FastAPI and PostgreSQL 17 using Docker Compose. Caddy serves the React build and forwards `/api` unchanged. Only ports 80/443 are published. Backend cookies are Secure; camera, microphone and native sharing use HTTPS.

## Configuration

Copy `.env.example` to `.env` (mode 600). Install the restricted AWS credential file at `secrets/aws_credentials`, owner 10001:10001, mode 400. Never commit credentials. The existing S3 policy allows media access and backup uploads; it does not allow inspecting bucket settings or restoring backups.

The backend initializes a fresh schema and Sohail Malik using ADMIN_PASSWORD only when no administrator exists. Later environment changes do not reset that password. Production uses `cashbook_database_v2`; the previous `cashbook_database` volume is retained separately. Never run `docker compose down -v` on production.

For a new server, build both images, then run `docker compose up -d --wait`. Keep ports 80/443 open for Caddy certificate issuance/renewal. A public IP or a domain can be used.

## Storage and backups

Local development keeps files in backend/uploads. Production stores immutable objects under the configured S3 media prefix, with unique keys that avoid collisions after database resets. Authorized attachment requests redirect to a signed S3 URL valid for 60 seconds. Do not share or log signed URLs.

Run `sudo bash /opt/cashbook/deploy/backup.sh` for a PostgreSQL custom-format dump uploaded to the backup prefix. No writer downtime is needed: pg_dump takes a consistent snapshot, and saved media are not removed during normal operations. The systemd timer runs at 03:00 Asia/Karachi. Check its service logs for failures; external failure notifications are not configured.

Restore into a separate empty database first using an administrator identity with S3 read access and `pg_restore --exit-on-error --no-owner`. Restore the corresponding S3 media if needed. Clear sessions before exposing the restored app. Do not overwrite a live database during a restore drill. S3 versioning, encryption and Block Public Access must be verified separately in the AWS console; the runtime identity cannot inspect them.

## Releases

See CICD.md. The first schema replacement is a deliberate one-time cutover; ordinary releases do not reset the database. Backward-incompatible database changes require a reviewed migration and cannot safely rely on application-image rollback alone.
