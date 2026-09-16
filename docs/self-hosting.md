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

Memory is used for no durable delivery store in v0.1. A retry after a restart can repeat work, but marker-based comments keep summaries from multiplying. A future SQLite/Redis storage adapter can strengthen idempotency and rate state.
