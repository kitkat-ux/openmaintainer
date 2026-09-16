# Development

Requirements: Node.js 20+, Corepack, and pnpm matching the `packageManager` field.

```bash
corepack enable
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm demo
```

Use `pnpm format` to format. Tests are offline and use `MockAIProvider`; no GitHub or AI credentials are required. Add tests for new core behavior, malformed provider responses, permission changes, and prompt-injection content. Keep external integrations behind interfaces and avoid putting prompts in business logic.

A Changesets entry can be created with `pnpm changeset`. The repository is a private workspace in v0.1; package publication requires an explicit future release decision.
