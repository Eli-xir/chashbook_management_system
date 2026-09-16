# What to request from the client

Target: Mumbai (`ap-south-1`), a fresh database, no demo accounts, Lightsail Linux $7/month starting plan. S3, snapshots, SMS, tax and excess transfer are separate charges. Confirm credits cover the chosen services and expiry in Billing; do not assume $200 guarantees a fixed hosting period.

## Access for deployment

Choose ONE:

1. Give the developer AWS IAM Identity Center access to manage this app's Lightsail instance, static IP/firewall, S3 buckets and the runtime IAM policy/user. Provide the **SSO start URL, SSO region, AWS account ID and role name**. Log in locally using `aws configure sso --profile cashbook-deploy` then `aws sso login --profile cashbook-deploy`. AWS CLI is not currently installed on the developer's computer.
2. Client provisions the server/buckets and provides **server static IP, SSH username (`ubuntu` for Ubuntu), and a local path to the SSH private key**, plus the S3 details below. Share the private key securely, not in Git or chat. A public SSH key can instead be installed on the server.

Also provide the **domain/subdomain** and permission/access to set its DNS A record to the Lightsail static IP. No domain registrar password is needed if the client creates the record.

## Server access to ordinary Amazon S3

For this Lightsail setup, create a dedicated IAM runtime user with ONLY the policy in `iam-runtime-policy.json`, substituting the two bucket names. No console login, no administrator policy, no root keys. Deployment permissions and runtime permissions are separate.

Required runtime values:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- attachment bucket name
- backup bucket name
- region: `ap-south-1`

The client should place the key pair in the private server file `deploy/secrets/aws_credentials`, not send it in a conversation. Format:

```ini
[default]
aws_access_key_id = CLIENT_VALUE
aws_secret_access_key = CLIENT_VALUE
```

Restrict the parent `secrets` directory to the deployment administrator. The container runs as UID 10001; grant that UID read permission on the file (e.g. `sudo chown 10001:10001 secrets/aws_credentials; sudo chmod 400 secrets/aws_credentials`). Do not use a short-lived session credential as the unattended runtime credential without an automatic renewal mechanism. Rotate this dedicated key later by replacing the file and recreating the backend container.

Both buckets: all Block Public Access options ON, default SSE-S3 encryption, versioning ON. No public website/ACL. The attachment bucket stores `images/` and `voice/` objects. Configure browser GET/HEAD CORS for only the chosen HTTPS site if needed by media playback; CORS is not authorization. Backup bucket lifecycle: keep daily backups 35 days, expire older current/noncurrent versions after the agreed retention. Keep attachment noncurrent versions for an agreed recovery period; do not expire live attachments.

## First administrator

Choose a username and enter the password directly into the interactive bootstrap command. We do not need to put the password in code, chat, or Git. Bootstrap creates no transactions, no heads, and no regular users.

## OTP later

Initial deployment uses `CASHBOOK_SMS_PROVIDER=disabled`; the UI tells users to contact the admin for a reset. There are no mock codes in production.

For Amazon SNS SMS, the client must arrange regional SMS production access, permitted destination countries (Pakistan), applicable sender/origination registration, a spending cap, and user consent. Start by verifying a test phone number in the SMS sandbox. Add `sns:Publish` permission for direct SMS only when enabling it, set provider to `sns`, then verify delivery with a consenting recipient. AWS sandbox allows only verified destination numbers. SMS cost/delivery is separate from Lightsail.

## Sources

- [Lightsail supported regions](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html) — UAE is not listed; Mumbai is supported.
- [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/) — $7 public IPv4 Linux plan has 1 GB RAM.
- [AWS CLI SSO setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [SNS SMS sandbox](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html)
