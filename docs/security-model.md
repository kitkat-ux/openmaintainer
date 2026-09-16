# Security model

## Controls

- HMAC SHA-256 webhook verification uses a timing-safe comparison and rejects missing/invalid signatures.
- Fastify caps webhook bodies at 1.5 MB. Provider requests and diffs are bounded by configuration.
- Zod validates configuration, provider output, and core data at boundaries.
- Repository content is untrusted prompt data. Versioned prompts explicitly reject embedded instructions and never receive environment variables.
- No repository code is run. No dynamic evaluation is used. Repository text never becomes a shell command.
- Commands require enabled configuration and a write-capable association; bot comments are ignored.
- Comments carry invisible markers and are updated rather than duplicated.
- Logs redact credential-shaped fields and avoid raw prompts, headers, secrets, and full content.
- The Docker runtime runs as a non-root user and does not bake secrets into the image.

This is a defense-in-depth design, not a guarantee that a provider or GitHub account is safe. Review permissions and provider policies before installing on sensitive repositories.

## Data boundary

Relevant code/diffs, issue text, and metadata may leave the server for the configured provider. The server does not send credentials or unrelated repository history. Users control the endpoint and must evaluate its retention and training policies.

Report vulnerabilities privately using the process in [SECURITY.md](../SECURITY.md), never a public issue.
