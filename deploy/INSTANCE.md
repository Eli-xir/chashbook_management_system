# Current Lightsail instance

Server: `ubuntu@13.202.242.159`, Mumbai. Application: `/opt/cashbook`, Compose: `/opt/cashbook/deploy`.
Frontend and API are currently served at https://13.202.242.159. PostgreSQL and Uvicorn have no public port mappings.
Caddy obtains and renews a short-lived public IP certificate; keep ports 80 and 443 open. Persistent Caddy data holds the ACME account/certificate.

Storage bucket: `cash-book-management-backups`, region `ap-southeast-1` (Singapore).
Media prefix: `attatchments` (existing spelling), mapped to `images/` and `voice_notes/`.
Backup prefix: `pg_dump`. Database object names remain portable `images/` and `voice/` keys.
The runtime IAM policy is `iam-cashbook-instance.json`. Bucket Block Public Access should remain enabled; enable versioning and default encryption through the S3 console.

## Storage credentials and backups

Restricted credentials for IAM user `cash_book_manager` are installed. Live image and voice uploads, signed downloads, and anonymous access denial were verified. A database/state backup was uploaded successfully. Daily backups run at 03:00 Asia/Karachi through `cashbook-backup.timer`, briefly pausing the backend for consistency. Check failures with `systemctl status cashbook-backup.service` and `journalctl -u cashbook-backup.service`; external failure notifications are not configured. A full restore drill remains pending: the runtime key deliberately cannot read backups.

For future credential rotation, use IAM user `cash_book_manager` without console access. Attach the inline JSON policy from `iam-cashbook-instance.json`. Create an access key for an application outside AWS. Install it in `/opt/cashbook/deploy/secrets/aws_credentials` as:

```ini
[default]
aws_access_key_id=YOUR_KEY
aws_secret_access_key=YOUR_SECRET
```

Owner must be UID/GID 10001, permissions 400; parent directory 700. Never commit the credentials. Restart the backend after replacing credentials.

A first admin was created with a generated password, stored privately in `/home/ubuntu/cashbook-admin.txt` and copied to the operator's Downloads folder. No example users or transactions were seeded. OTP is disabled pending SMS provider setup.

## Hosting

Both frontend and backend run on Lightsail at the static IP HTTPS address. Vercel is not used.

## Operations

```sh
cd /opt/cashbook/deploy
sudo docker compose ps
sudo docker compose logs --tail=100 backend
sudo docker compose up -d
sudo bash backup.sh
```

The server has 2 GiB swap for its 1 GiB RAM. Docker restarts automatically; containers use unless-stopped.
Deployments now run through GitHub Actions after checks pass on main; see `CICD.md`. Source for the active commit is recorded in `/opt/cashbook/current-release` and extracted under `/opt/cashbook/releases`. Never run `down -v` on this live instance.

Verification performed: production images built on Ubuntu, database/backend healthy, trusted HTTPS ready endpoint and frontend return 200, admin login succeeds with Secure cookies. Six targeted production/storage tests pass locally. Live S3 integration and backup upload passed. Full backup restore remains pending.
