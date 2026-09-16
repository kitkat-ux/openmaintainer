# Changelog

All notable changes to this project are documented here.

## Unreleased — Phase 2 hardening

- Verify actual command permissions and prefixes; document release-notes guidance.
- Authenticate and validate webhook routing before work; cap and coalesce deliveries within one process.
- Match exact own-App comment markers, serialize upserts, and clear stale duplicate suggestions.
- Correct ignore globs, partial diff reporting, context budgets, focus filtering, and release traceability.
- Bound and validate all provider responses; fix deadline/retry behavior and redact failures.
- Suppress sensitive issue details, neutralize model mentions/HTML, and retain legitimate code snippets.
- Modularize core/app responsibilities; add offline end-to-end tests and honest coverage.
- Require explicit CLI fixture/mock use, add verify, and correct Docker dependency packaging.

See [migration and known limitations](docs/phase-2-audit.md).

## 0.1.0 (initial implementation; no tag published)

Initial implementation with PR review, issue triage, duplicate detection, Markdown release notes, maintainer command parsing, CLI demo, GitHub webhook server, provider abstraction, configuration validation, tests, Docker support, and contributor documentation.
