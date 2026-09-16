# Self-hosting

## Docker Compose

```bash
cp .env.example .env
# edit .env; never commit it
docker compose up --build
curl http://localhost:3000/health
```

## Plain Node

```bash
corepack enable
pnpm install
pnpm build
pnpm --filter @openmaintainer/github-app start
```

The app binds `0.0.0.0`, defaults to port `3000`, and has no database requirement. Put it behind an HTTPS reverse proxy in production, forward the webhook path without changing the body, and restrict access to the health endpoint if desired. GitHub cannot call a localhost URL; use a development tunnel only for local testing and rotate its webhook secret afterward.

Use one instance: delivery replay protection and per-issue serialization are process-local. Restarts can repeat provider work; replicas can race when creating comments. A future SQLite/Redis queue/store is needed for durable idempotency and rate state. GitHub does not automatically retry failed deliveries; use its delivery UI or an external operator-managed redelivery mechanism. Synchronous provider work may exceed GitHub's response timeout.

Node does not automatically load `.env` here. Export variables in your process manager or use `node --env-file=.env apps/github-app/dist/index.js` from the repository root. Compose loads `.env` through `env_file`. The server refuses missing GitHub credentials/webhook secret and missing provider key/model unless `OPENMAINTAINER_PROVIDER=mock` is explicitly selected.

Dockerfiles build the app and its workspace dependency closure, then use `pnpm deploy --prod` for a self-contained dependency tree and non-root runtime. Docker was unavailable during Phase 2: build, Compose startup and container health are **not validated**. The workspace build/deploy and deployed Node health can be checked separately, but do not substitute for a container smoke test.

Request rate limiting uses the direct peer IP (120/minute) without trusting `X-Forwarded-For`. Behind a reverse proxy, this is effectively a shared ingress limit; plan capacity accordingly. It is separate from the 20-request pending-work cap and does not persist across restarts. Mount an operator configuration file read-only at `/app/.openmaintainer.yml` to override defaults in a container; Compose does not mount one automatically.
