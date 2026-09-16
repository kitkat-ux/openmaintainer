# Contributing

Thank you for improving OpenMaintainer. Start with Node.js 20+, then:

```bash
corepack enable
pnpm install
pnpm demo
pnpm verify
pnpm test:coverage
```

Read [the architecture guide](docs/architecture.md) before changing boundaries. Keep domain code in `packages/core` free of Fastify, Octokit, and vendor SDK imports. Use explicit types, bounded input, safe error messages, and tests that run offline.

## Adding a provider

Implement all methods of `AIProvider`, validate the provider response with Zod, map authentication/transient errors without leaking secrets, and inject it from the app. Add unit tests using a fetch mock; do not make CI call a live provider. See [docs/ai-providers.md](docs/ai-providers.md).

## Adding a command

Extend the command union and parser in core, keep it permission-gated, add an event-handler test, and document it in `docs/commands.md`. Commands must not merge, close, publish, delete, or execute source code by default.

Use focused commits, explain the motivation in PRs, and update docs/config examples when behavior changes. PRs should include tests and mention security/privacy impact. The pull request template is a checklist, not bureaucracy. Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

## Master verification

`pnpm verify` runs format checking, lint, typecheck, offline tests, workspace build, and the deterministic demo in that order. It builds once; `demo:run` reuses the result. `pnpm demo` remains standalone and builds first. Coverage is a separate gate so ordinary verification does not execute the suite twice. Coverage includes production entrypoints; do not exclude `index.ts` to improve percentages.

See [Phase 2 audit and migration notes](docs/phase-2-audit.md). Keep `pnpm-lock.yaml` frozen in CI. Dependency-review API checks are opt-in via the repository variable `DEPENDENCY_REVIEW_ENABLED=true` after the owner enables the dependency graph. The workflow always audits production dependencies locally against the registry, without provider or GitHub credentials.
