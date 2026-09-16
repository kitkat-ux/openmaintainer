# GitHub App setup

1. Create a GitHub App owned by your account or organization.
2. Set the webhook URL to `https://your-host.example/webhooks/github` and create a random webhook secret.
3. Subscribe to `Pull request`, `Issues`, and `Issue comment` events only.
4. Request: Metadata read-only; Contents read-only; Pull requests read/write; Issues read/write. Do not request administration, Actions, deletion, merge, or release permissions.
5. Generate a private key and keep the PEM outside Git. Set `GITHUB_PRIVATE_KEY` with escaped newlines (`-----BEGIN PRIVATE KEY-----\n...`) or inject it as a secret file transformed into an environment value.
6. Install the App in selected repositories and configure `.env` with `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`.
7. Confirm `GET /health`, then deliver a test webhook from GitHub's App settings.

The app will only comment or update marked comments. It does not merge, close, publish, delete, or modify source files. `issue_comment` commands are allowed for OWNER, MEMBER, and COLLABORATOR associations and still respect `commands.allowedRoles`.
