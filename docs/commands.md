# Maintainer commands

Commands must begin with the configured prefix (default `/om`) as the first token of a newly created GitHub comment:

- `/om` or `/om help` — list commands.
- `/om review` — review the current PR; an explicit authorized command can review a draft.
- `/om summarize` — alias of review, not a separate summary operation.
- `/om triage` — triage the current issue (not a PR).
- `/om duplicates` — compare the current issue with bounded candidates.
- `/om release-notes` — show CLI instructions. It does **not** fetch a release range or publish anything.

Every command, including help, checks the comment author's current repository role through GitHub's collaborator-permission API. `admin`, `maintain`, and `write` are allowed by default. `triage` requires explicit inclusion in `commands.allowedRoles`; read/unknown roles and failed permission lookups are denied. Author association is not an authorization source. Permissions are checked before provider calls.

Bot-authored comments, bot-sender events, and comment edits are ignored. Unrecognized prefixes/commands do nothing. Feature switches still apply to commands. Unauthorized users receive no internal configuration details. Processing failures return 503 with no upstream exception details; arrange redelivery through GitHub's delivery UI or an operator-managed queue.
