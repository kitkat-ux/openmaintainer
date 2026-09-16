# Maintainer commands

Commands are written as GitHub comments using the configured prefix (default `/om`):

- `/om help` — show available commands.
- `/om review` — run a review when the comment is on a pull request (event wiring for manual review is intentionally conservative in v0.1).
- `/om summarize` — reserved summary operation.
- `/om triage` — triage the current issue.
- `/om duplicates` — compare the current issue with bounded candidates.

Only enabled commands from write-capable repository associations are accepted. Bot-authored comments are ignored. Unknown commands do nothing, and unauthorized comments receive no internal configuration details. Automatic workflows fail quietly to avoid comment spam; logs contain safe diagnostics.
