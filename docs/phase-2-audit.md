# Phase 2 audit — 2026-09-16

## Scope and base

Inspected latest fetched `main` at `c5abc804f7c088e28861459aed97289889274ff1`: every production source file, existing test, manifest, workflow, fixture, configuration example and repository document. The session branch `arena/01a0aa33-openmaintainer` had no existing PR and differs from the previous merged branch/PR #1. Arena fixes the branch name, so no alternate branch was created. No direct main push, Dependabot merge, release, tag, or fabricated community activity occurred.

## Actual findings and fixes

- Command help omitted the already-parsed release-notes command. More importantly, webhook commands bypassed prefix parsing and treated OWNER/MEMBER/COLLABORATOR associations as write access. Commands now use the parser and a fail-closed live repository permission lookup before AI work.
- Draft checks depended only on webhook fields; adapter metadata is now checked too. Issue master switches were not consistently enforced, and duplicate automation was tied to triage. Feature switches now govern the appropriate work independently.
- Glob-to-regex replacement corrupted `**` and allowed surprising suffix matching. Picomatch 4 replaces it with documented root-relative semantics; no filesystem execution is involved. This small maintained dependency is justified by nontrivial globstar/dotfile matching.
- A single truncated diff could be reported as complete; omitted paths were incomplete. File and aggregate patch limits now report every skipped/truncated path, avoid empty provider calls, and prioritize sensitive source deterministically. Focus was inert; it now guides prompts and filters findings.
- HTTP retry code interpreted a missing Retry-After header as zero, did not honor the overall timeout during waits, retained abort listeners, and propagated raw exceptions. Three-attempt transport now supports bounded date/seconds Retry-After, exponential backoff/jitter, cancellation and a 1 MB response cap, without upstream error text/causes.
- Duplicate and release requests demanded arrays while requesting JSON-object mode. HTTP envelopes now use `items`; the public provider methods still return arrays.
- Only the HTTP provider validated output, while several response strings/arrays were unlimited. Core validates custom/mock provider results too; bounded schemas reject hostile shapes before use. Unknown/duplicate candidate references and findings for unselected files are dropped.
- Release entries could attach invented prose/URLs/commit IDs to a real reference. Public text now comes from the supplied PR title and URL, with provider categorization only; unknown/repeated references are discarded. The caller still must verify input merge state.
- Security reports could repeat exploit text above a disclosure warning. Sensitive triage output is now a fixed SECURITY.md/private-reporting message; duplicate comparison is suppressed for locally detected sensitive reports. No issue is closed.
- Markdown filtering only addressed two mentions and HTML comments. It now neutralizes all username/team mentions and HTML outside code spans/fences; code stays intact. This is not a comprehensive Markdown policy engine.
- Upserts could edit another bot's marked comment. Matching now requires exact leading marker/newline and the configured App identity. Same-target events serialize and successful delivery IDs are cached within one process. Empty duplicate results replace stale suggestions. Comment bodies are bounded at 60,000 characters to stay below the GitHub API limit.
- Webhook JSON was cast without runtime validation, and failures were acknowledged as success. Routing fields now validate after HMAC verification, malformed bodies fail safely, and upstream errors return 503 without secret-bearing exception objects. Raw payload cap remains 1.5 MB.
- CLI commands silently processed bundled mock data. Explicit fixture input and mock selection make provenance visible; real provider mode requires credentials. Validate fails on a missing file; runtime defaults remain supported. Bad YAML no longer prints source snippets; nested keys are strict.
- Docker built only the app, not external workspace packages, and relocated dependency paths. Both Dockerfiles now build the dependency closure and package it with `pnpm deploy --prod`; package files lists include built artifacts only.
- Coverage excluded every `index.ts`, creating an unrepresentative 91.11% baseline over almost no logic (17 tests). That exclusion is removed. New offline tests exercise the real adapter via injected Octokit HTTP transport.

## Architecture

Core public exports remain available. Separate review selection/risk/service/rendering, issue triage/duplicate services/rendering and release/command modules isolate policies and reduce event-handler coupling. The app separates environment/provider loading, GitHub composition, raw HTTP transport/replay controls and event routing/handlers; its entrypoint only starts and shuts down the server. These are explicit functions, not a DI framework. A dependency-boundary test prevents core importing Fastify, Octokit or server code.

## Migration / behavior changes

- CLI `review`, `triage`, `release-notes` require `--fixture`; add `--mock` for offline work. Without it, provider key/model are required. Release refs are labels only, not a git/GitHub range query.
- The server requires App ID, private key and webhook secret. Mock mode requires explicit `OPENMAINTAINER_PROVIDER=mock`; it no longer silently substitutes for missing real credentials.
- Config nested typos fail instead of being ignored. `privacy.telemetry` and `privacy.debugPrompts` accept only false; unsupported true previously did nothing. `triage` command permission is opt-in, never a default.
- `summarize` remains a review alias. The release-notes GitHub command supplies CLI guidance, not automated range fetching.
- Release text is grounded source titles, not generated prose. Duplicate/release HTTP response contracts use object envelopes. Review focus now affects results.
- Existing owned comments with the exact marker and App attribution are updated. Ambiguous legacy comments are not adopted automatically; an owner may need to remove a legacy duplicate once.

## Dependencies and CI

Initial audit: 8 advisories (1 critical, 1 high, 5 moderate, 1 low), all in development tooling. Upgraded Vitest and its coverage package together to 4.1.11 and pinned a supported Vite 6.4.3 range rather than leaving the old vulnerable Vite peer resolution. No production advisories were reported in the follow-up audit. A low-severity esbuild Windows development-server advisory remains transitively in Vite/tsup; this repository does not expose those esbuild servers. Do not start such servers on untrusted networks. An esbuild minor-major override was not forced across tooling without compatibility evidence.

CI retains Node 20/22 format/lint/typecheck/tests/build and adds the deterministic already-built demo. `pnpm verify` does not rebuild the demo twice. All tests use local mocks and an unexpected-fetch guard; registry install/audit still need network access. Coverage includes all source; startup listening and real GitHub App authentication remain untested by unit coverage.

Existing dependency-review check annotations say: “Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled.” CI now always runs a production audit; diff review is opt-in through `DEPENDENCY_REVIEW_ENABLED=true` after the owner enables the graph. This avoids an unsupported-API failure without silently pretending the diff review ran.

## Open Dependabot PR assessment

Reviewed each PR's diff, release notes and existing checks; did not check out, merge or locally execute those branches. Passing pre-hardening CI only covers the old 17-test suite. All ten had a failing unsupported dependency-review check; logs downloads failed in this environment, so failure causes below are not asserted solely from exit codes.

| PR                                                         | Change                  | Existing CI                   | Recommendation                                                                                                                                                                         |
| ---------------------------------------------------------- | ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#2](https://github.com/kitkat-ux/openmaintainer/pull/2)   | setup-node 4 → 7        | Node 20/22 passed             | Reasonable separate update after rebase; review ESM/runner and cache behavior. Re-run hardening gates.                                                                                 |
| [#3](https://github.com/kitkat-ux/openmaintainer/pull/3)   | Zod 3 → 4               | Node 20 failed, 22 cancelled  | Hold. Major default/error/schema/type semantics need deliberate migration and the expanded validation suite.                                                                           |
| [#4](https://github.com/kitkat-ux/openmaintainer/pull/4)   | Node types 22 → 26      | Node 20/22 passed             | Defer: types newer than supported runtimes can permit unavailable APIs. Align with the runtime support policy first.                                                                   |
| [#5](https://github.com/kitkat-ux/openmaintainer/pull/5)   | CodeQL action 3 → 4     | Node 20/22 and Analyze passed | Reasonable separate update after checking runner requirements and rebasing.                                                                                                            |
| [#6](https://github.com/kitkat-ux/openmaintainer/pull/6)   | checkout 4 → 7          | Node 20/22 passed             | Reasonable separate update; review changed credential persistence and fork checkout protections. Current workflows do not use pull_request_target.                                     |
| [#7](https://github.com/kitkat-ux/openmaintainer/pull/7)   | Changesets 2 → 3        | Node 20 failed, 22 cancelled  | Hold: upstream requires pnpm >=10 and newer Node, conflicting with pnpm 9/Node 20 support; tag command/config behavior also changes.                                                   |
| [#8](https://github.com/kitkat-ux/openmaintainer/pull/8)   | dependency-review 4 → 5 | Node 20/22 passed             | Hold until dependency graph is enabled and optional diff review can be validated. The action upgrade alone does not fix repository capability.                                         |
| [#9](https://github.com/kitkat-ux/openmaintainer/pull/9)   | pnpm action 4 → 6       | Node 20/22 passed             | Reasonable separately after rebase; retain pnpm 9.15.4 explicitly and check the Node 24 action runtime/runner support.                                                                 |
| [#10](https://github.com/kitkat-ux/openmaintainer/pull/10) | ESLint 9 → 10           | Node 20/22 passed             | Separate coordinated migration with @eslint/js and typescript-eslint peers and supported Node patch versions; do not merge based only on old tests.                                    |
| [#11](https://github.com/kitkat-ux/openmaintainer/pull/11) | Octokit REST 21 → 22    | Node 20 failed, 22 cancelled  | Hold until failure is diagnosed and auth-app/REST types are validated together. Removed legacy endpoints are unused, but installation auth and upserts need the new integration suite. |

## Metadata

Attempted the requested description/topics with `gh repo edit`; the integration returned HTTP 403 and no values changed. Owner recommendation:

Description: Open-source AI maintainer for GitHub — PR review, issue triage, duplicate detection, and release-note automation.

Topics: `open-source`, `github`, `github-app`, `ai`, `developer-tools`, `code-review`, `pull-requests`, `issue-triage`, `maintainers`, `typescript`, `automation`.

No website URL was added.

## Validation and release decision

Local validation on Node 22.22.3 / pnpm 9.15.4:

| Command                                                              | Result                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile`                            | PASS                                                                      |
| `corepack pnpm format:check`                                         | PASS                                                                      |
| `corepack pnpm lint`                                                 | PASS                                                                      |
| `corepack pnpm typecheck`                                            | PASS                                                                      |
| `corepack pnpm test`                                                 | PASS — 161 tests across 12 files                                          |
| `corepack pnpm test:coverage`                                        | PASS — statements 92.34%, branches 83.33%, functions 89.04%, lines 94.59% |
| `corepack pnpm build`                                                | PASS                                                                      |
| `corepack pnpm demo`                                                 | PASS — deterministic mock, all four workflows                             |
| `corepack pnpm verify`                                               | PASS                                                                      |
| `corepack pnpm audit --prod --audit-level high`                      | PASS — no production advisories                                           |
| `corepack pnpm audit --audit-level high`                             | PASS at high severity threshold — one low dev-only advisory remains       |
| `pnpm --filter @openmaintainer/github-app deploy --prod <directory>` | PASS with dev-bin warnings noted below                                    |
| Deployed host Node `GET /health`                                     | PASS — HTTP 200; process stopped                                          |
| `docker build .` / `docker compose up --build -d`                    | NOT RUN — Docker unavailable                                              |

Coverage now includes all source and has regression floors (85% statements/lines, 75% branches, 80% functions). HTML/JSON coverage artifacts and raw command logs are intentionally not committed. Hosted CI results belong to the PR and are separate from these local results. Docker is unavailable: neither `docker build .` nor Compose is claimed as validated. Host-side pnpm deployment is not container validation. `pnpm deploy --prod` completed and the deployed Node process returned HTTP 200 from `/health` with only status/version/uptime, then was stopped cleanly. pnpm 9 emitted warnings about missing development-only esbuild/TypeScript bin links during deploy; the production app booted, but container packaging still needs its own smoke test.

Release readiness is **CONDITIONAL**: package versions are consistently 0.1.0, Apache-2.0 license, security policy, governance, changelog and tests exist, but container validation, real App installation smoke testing and passing final hosted CI remain release gates. No tags/releases currently exist. Private vulnerability reporting availability was not verified. Packages are private workspaces, not an npm distribution. Changesets versioning is not executed by this audit; maintainers must reconcile queued minor changesets before deciding a repository-wide tag/version policy.

After those gates, proposed tag: `v0.1.0`; title: **OpenMaintainer v0.1.0 — initial self-hosted preview**.

Proposed release notes:

> Initial self-hosted preview with bounded PR review, issue triage, duplicate suggestions and source-grounded release-note drafts. Includes a credential-free deterministic demo, explicit fixture CLI, signed GitHub webhooks, permission-gated commands and owned-comment updates. No automatic merges, issue closure, label application, source writes or release publishing. APIs are early and may change. Run one server instance; delivery replay/cost state is not durable. Review provider privacy policies and validate deployment before use with sensitive repositories.

## Remaining limitations and three legitimate next tasks

1. Add a durable worker queue/store with cross-replica idempotency, retry scheduling, and per-installation cost budgets. Synchronous processing may exceed GitHub timeouts; local caching does not solve that.
2. Add Docker/Compose smoke CI plus a documented real sandbox-App installation test. Verify actual permissions, App attribution fields, signal shutdown and reverse-proxy behavior.
3. Implement verified merged-PR range ingestion and better diff chunking/completeness metadata. The CLI currently trusts supplied merge metadata; GitHub omits some patches and caps files at 3,000.

Prompt-injection fixtures demonstrate boundaries, not model obedience. Markdown handling is deliberately limited. Sensitive-issue detection can miss reports; private reporting remains essential. No per-repository remote config loading, durable rate quota, inline review comments, label application, live AI/GitHub validation, npm publication, or adoption claim is implied.
