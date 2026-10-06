# Previous Lightsail instance (retained for recovery)

As of 6 October 2026, GitHub production deployments target the client's instance documented in CLIENT_INSTANCE.md. After the user confirmed the migration, this previous installation was stopped and the operating system was shut down over SSH. Its backup timer was disabled and its deployment-only SSH key was removed. The AWS resource has not been deleted: available credentials do not permit Lightsail management. Administrative SSH access can be used again after a console restart.

The final recovery dump was copied and verified in the client's bucket at s3://cash-book-management-backup/pg_dump/cashbook-old-before-retirement-20261006T034738Z.dump. The old database volume and S3 contents were preserved. frontend/vercel.json still points here at the user's request, so that Vercel site's API is unavailable until its routing is changed separately.

- SSH: ubuntu@13.202.242.159 (Mumbai).
- Application: https://13.202.242.159
- Stable infrastructure: /opt/cashbook/deploy
- Active release: /opt/cashbook/current-release
- S3: cash-book-management-backups, ap-southeast-1 (Singapore).
- Media: attatchments/images/ and attatchments/voice_notes/ (existing spelling).
- Backups: pg_dump/; new schema backups begin cashbook-v2-.
- Compose project: cashbook-v2; legacy containers remain separate and stopped after cutover.
- PostgreSQL volume: cashbook_database_v2; legacy volume preserved.
- Initial administrator: Sohail Malik, alias admin. Password stored privately in /home/ubuntu/cashbook-admin-v2.txt. Change it through the application.
- Legacy recovery files: /opt/cashbook/legacy-20260924 (root only), including database.dump and former configuration. Former application images retain :legacy-20260924 tags.
- Daily backup timer: cashbook-backup.timer, 03:00 Asia/Karachi.

The host has approximately 1 GiB RAM, 2 GiB swap and a 40 GB disk. Ports 80/443 serve Caddy; backend and PostgreSQL have no public mappings. AWS API access is unavailable with the restricted runtime key, so static-IP attachment, Lightsail firewall settings and S3 bucket controls require administrator-console verification.

Runtime AWS credentials are mounted from deploy/secrets/aws_credentials (owner 10001:10001, mode 400). Keep the parent directory private. Never print credentials or commit them.
