# Inputs needed before AWS deployment

Local development must not depend on these being available. This is a later deployment checklist, not permission to create resources now.

## Owner decisions and access

- AWS account and chosen region; provide a scoped authenticated CLI/SSO session or deployment role. Do not paste root credentials or secret access keys into prompts or commit them.
- Monthly budget, expected users/concurrent users, attachment storage/retention, and acceptable downtime. Use these to choose hosting; do not assume expensive infrastructure is necessary for a small office.
- Domain and DNS access if using a custom domain; desired admin and API hostnames. Plan HTTPS and certificates.
- Which existing AWS resources can be reused (VPC, database, buckets, hosting), and whether local data should be migrated or production should start empty.
- Production admin username and recovery number, provided securely; initial password/bootstrap procedure and who may administer the system.

## Suggested architecture to size after local completion

- React admin web build on static hosting, for example S3 behind CloudFront.
- Containerized FastAPI on an appropriately sized AWS compute service (choose EC2/Lightsail or ECS based on budget/operations requirements).
- PostgreSQL, preferably managed RDS where budget allows, reachable only by authorized backend/administration paths.
- Private S3 bucket for images/voice, and a separate release location/prefix for APK downloads with a chosen access policy.
- Secrets Manager or Parameter Store for runtime secrets; IAM roles for AWS access. Logs, backups, restore procedure, storage limits and alerts.

These are candidate services, not an already deployed or priced plan. Verify current costs before choosing. Include database/storage/backups/SMS/networking costs, not only compute.

## SMS recovery

- AWS End User Messaging SMS configuration in the selected region.
- Destination countries (initially Pakistan), expected message volume, sender/origination identity as supported by the destination, and spending limits.
- Check sandbox/production status. In the SMS sandbox, only verified destination numbers may receive messages; production access is needed for unrestricted approved usage.
- Test destination numbers and any provider-required onboarding information. Real-device delivery testing is separate from local mock testing.
- Do not enable development OTP logging in production.

Reference: https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html

## Android delivery

- App display name, package/application ID, icon, and supported devices/Android versions.
- Decide direct signed APK distribution versus a store/managed distribution channel. Direct download needs an update/install process for office users.
- A signing keystore and secure backup. Keep its passwords outside source control. Reuse the signing identity for future updates.
- Production API URL, allowed Capacitor origin, and tested camera/microphone/gallery permissions.
- Android SDK/JDK/build environment locally or in CI. The APK runs on phones; AWS hosts its downloadable installer and backend, not the Android UI process.

## Deployment acceptance

Provide repeatable deployment/rollback instructions, apply migrations with a backup, bootstrap admin securely, verify HTTPS/auth/CORS, confirm private attachment access and SMS reset, install the release APK on a real device, and validate a backup restore path. Never expose PostgreSQL to the app clients.

Reference for runtime secrets: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html
