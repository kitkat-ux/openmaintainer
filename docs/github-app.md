# GitHub App setup

1. Create a GitHub App owned by your account or organization.
2. Set the webhook URL to `https://your-host.example/webhooks/github` and create a random webhook secret.
3. Subscribe to `Pull request`, `Issues`, and `Issue comment` events only.
4. Request: Metadata read-only; Contents read-only; Pull requests read/write; Issues read/write. Do not request administration, Actions, deletion, merge, or release permissions.
5. Generate a private key and keep the PEM outside Git. Set `GITHUB_PRIVATE_KEY` with escaped newlines (`-----BEGIN PRIVATE KEY-----\n...`) or inject it as a secret file transformed into an environment value.
6. Install the App in selected repositories and configure `.env` with `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`.
7. Confirm `GET /health`, then deliver a test webhook from GitHub's App settings.

The app will only comment or update marked comments. It does not merge, close, publish, delete, or modify source files. `issue_comment` commands query actual repository roles through the Metadata-read collaborator-permission endpoint and respect `commands.allowedRoles`. Author association does not grant access.

## API/permission inventory

Current calls: `pulls.get`/`pulls.listFiles` (PR read), `issues.get`/`issues.listComments`/`issues.createComment`/`issues.updateComment` (Issues read/write), issue search (repository visibility), and `repos.getCollaboratorPermissionLevel` (Metadata read). App identity is supplied by configured App ID; the standalone adapter can fall back to `apps.getAuthenticated` with App authentication. No source write, label write, merge, close, release, or administrative endpoint is called. Contents read is reserved, not currently used.

Upserts require the comment's `performed_via_github_app.id` to equal the configured App ID and its body to start with the exact `<!-- openmaintainer:pr-review -->` (or `issue-triage`, `duplicates`, `command`) marker followed by a newline. Markers embedded in another bot's or a user's comment are never treated as owned comments.
