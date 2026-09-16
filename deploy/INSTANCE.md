# Current Lightsail instance

Server: `ubuntu@13.202.242.159`, Mumbai. Application: `/opt/cashbook`, Compose: `/opt/cashbook/deploy`.
Frontend and API are currently served at https://13.202.242.159. PostgreSQL and Uvicorn have no public port mappings.
Caddy obtains and renews a short-lived public IP certificate; keep ports 80 and 443 open. Persistent Caddy data holds the ACME account/certificate.

Storage bucket: `cash-book-management-backups`, region `ap-southeast-1` (Singapore).
Media prefix: `attatchments` (existing spelling), mapped to `images/` and `voice_notes/`.
Backup prefix: `pg_dump`. Database object names remain portable `images/` and `voice/` keys.
The runtime IAM policy is `iam-cashbook-instance.json`. Bucket Block Public Access should remain enabled; enable versioning and default encryption through the S3 console.

## Outstanding setup

At initial deployment the credentials file is a comment-only placeholder. S3 uploads and backups do not work until valid credentials are installed. No automatic backup job is enabled yet. Verify an upload/download and a backup/restore before real use.

Create IAM user `cashbook-runtime` without console access. Attach the inline JSON policy from `iam-cashbook-instance.json`. Create an access key for an application outside AWS. Install it in `/opt/cashbook/deploy/secrets/aws_credentials` as:

```ini
[default]
aws_access_key_id=YOUR_KEY
aws_secret_access_key=YOUR_SECRET
```

Owner must be UID/GID 10001, permissions 400; parent directory 700. Never commit the credentials. Restart the backend after replacing credentials.

A first admin was created with a generated password, stored privately in `/home/ubuntu/cashbook-admin.txt` and copied to the operator's Downloads folder. No example users or transactions were seeded. OTP is disabled pending SMS provider setup.

## Vercel

Import GitHub repository `Eli-xir/chashbook_management_system`, branch `main`, root directory `frontend`, framework Vite. Build `npm run build`, output `dist`. No AWS keys or database credentials belong in Vercel. `vercel.json` proxies `/api/*` to the server using HTTPS and serves SPA routes.
After getting the production Vercel URL, set `CASHBOOK_CORS_ORIGINS=https://YOUR-PROJECT.vercel.app,https://13.202.242.159` in the server's deploy `.env`, then run `sudo docker compose up -d backend`. This is the backend origin allowlist even though browser requests use the same-origin Vercel proxy. Do not wildcard preview domains.
Verify login, CSRF-protected requests, image upload, voice upload/playback through the deployed proxy. Vercel is not yet deployed or verified. Client commercial use requires an eligible Vercel plan.

## Operations

```sh
cd /opt/cashbook/deploy
sudo docker compose ps
sudo docker compose logs --tail=100 backend
sudo docker compose up -d
sudo bash backup.sh
```

The server has 2 GiB swap for its 1 GiB RAM. Docker restarts automatically; containers use unless-stopped.
Source was transferred as an archive, not cloned with GitHub credentials. Rebuild/redeploy from the repository after code changes. Never run `down -v` on this live instance.

Verification performed: production images built on Ubuntu, database/backend healthy, trusted HTTPS ready endpoint and frontend return 200, admin login succeeds with Secure cookies. Six targeted production/storage tests pass locally. S3 integration, backup restore and Vercel checks remain pending credentials/setup.
