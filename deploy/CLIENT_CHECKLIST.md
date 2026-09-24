# Moving this deployment to a client account

1. Provide an Ubuntu Lightsail server, static IP and SSH access. Allow HTTPS/HTTP and restrict administrative SSH where practical. Keep database/backend ports private.
2. Choose a domain or the static IP for HTTPS. If using a domain, point its A record to the server.
3. Create private S3 storage. Verify Block Public Access, encryption and versioning in the administrator console. Use the actual bucket region; media and backups can use different prefixes of one bucket.
4. Create a restricted runtime IAM identity using iam-runtime-policy.json, adapting bucket names and prefixes to deploy/.env. This identity needs no Lightsail permissions. Restore operations use a separate administrative identity with backup read access.
5. Install runtime credentials privately in deploy/secrets/aws_credentials, owned by UID/GID 10001, mode 400. Never put them in GitHub, source code or chat.
6. Set deploy/.env: database password, initial ADMIN_PASSWORD, domain, buckets, region and prefixes. Initial startup creates only Sohail Malik (login alias admin), plus reference categories/types. Change the password through Users afterward.
7. Follow README.md for Docker startup and CICD.md for GitHub deployment secrets. Use new SSH/runtime keys for each client's account.
8. Enable the backup timer and verify a restore into a separate recovery database before handing over. Arrange external backup-failure notifications.

Password resets are performed by the administrator. This version has no SMS/OTP integration. The existing instance details are in INSTANCE.md.
