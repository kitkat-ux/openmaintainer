# Configuration reference

Configuration is YAML in `.openmaintainer.yml`. The schema has a required `version: 1` and rejects unknown keys at every level. Run `openmaintainer validate` after editing.

| Setting                               | Type / default                                               | Meaning                                                          |
| ------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `version`                             | literal `1`                                                  | Configuration schema major version.                              |
| `review.enabled`                      | boolean, `true`                                              | Enable automatic PR review.                                      |
| `review.drafts`                       | boolean, `false`                                             | Review draft PRs when true.                                      |
| `review.minimumConfidence`            | number 0–1, `0.72`                                           | Minimum finding confidence to retain.                            |
| `review.maxInlineComments`            | integer, `8`                                                 | Maximum actionable findings in the summary.                      |
| `review.maxFiles`                     | integer, `50`                                                | Maximum eligible files to send to a provider.                    |
| `review.maxDiffCharacters`            | integer, `120000`                                            | Bounded aggregate textual diff.                                  |
| `review.focus`                        | list, correctness/security/tests/performance/maintainability | Provider focus hints and finding filter (tests maps to testing). |
| `review.ignore`                       | list of picomatch glob patterns                              | Skip lockfiles, generated, vendor, and binary paths.             |
| `issues.enabled`                      | boolean, `true`                                              | Master issue feature switch.                                     |
| `issues.triage.enabled`               | boolean, `true`                                              | Enable categorization comments.                                  |
| `issues.duplicates.enabled`           | boolean, `true`                                              | Enable candidate comparison.                                     |
| `issues.duplicates.minimumConfidence` | number, `0.82`                                               | Confidence required before suggesting a duplicate.               |
| `issues.duplicates.maxCandidates`     | integer, `5`                                                 | Candidate limit sent to the provider.                            |
| `commands.enabled`                    | boolean, `true`                                              | Enable maintainer commands.                                      |
| `commands.prefix`                     | `/`-prefixed string, `/om`                                   | Comment command prefix.                                          |
| `commands.allowedRoles`               | admin/maintain/write (default); triage opt-in                | Roles allowed to invoke expensive commands.                      |
| `releaseNotes.enabled`                | boolean, `true`                                              | Enable Markdown generation.                                      |
| `privacy.telemetry`                   | literal `false`                                              | No telemetry exists; true is rejected.                           |
| `privacy.debugPrompts`                | literal `false`                                              | Prompt logging is unsupported; true is rejected.                 |

Example strict setup:

```yaml
version: 1
review:
  minimumConfidence: 0.85
  maxInlineComments: 4
  focus: [correctness, security, tests]
issues:
  triage: { enabled: false }
  duplicates: { enabled: true, minimumConfidence: 0.9, maxCandidates: 3 }
commands: { enabled: true, prefix: /om }
releaseNotes: { enabled: true }
privacy: { telemetry: false }
```

A missing operator config file means conservative built-in defaults for runtime workflows. Explicit CLI `validate` requires the file to exist (run `init` first). Invalid YAML, unknown keys, unsupported versions, or out-of-range values fail with field paths and a non-zero CLI exit code.

## Scope and matching

The GitHub App loads one operator-local file at startup, not `.openmaintainer.yml` from each repository. Restart after changing it. `review.maxInlineComments` caps findings in the summary; no inline review comments are posted. Focus maps reliability/compatibility to correctness and documentation to maintainability; an empty focus list retains no findings.

Ignore patterns are repository-root relative, case-sensitive picomatch globs with dotfiles enabled and negation disabled. `**/*.lock` matches root and nested lockfiles; `dist/**` matches only root dist, while `**/dist/**` matches nested dist too. `packages/*/dist/**` crosses one package segment. No filesystem traversal occurs. Binary/missing-patch files are not sent for review.

Default ignore list: `**/pnpm-lock.yaml`, `**/package-lock.json`, `**/yarn.lock`, `**/*.min.js`, `dist/**`, `build/**`, `coverage/**`, `vendor/**`. Other generated paths must be configured, for example `src/generated/**`.

Additional fixed context caps: titles 500 characters; PR/issue bodies 20,000; candidate bodies 10,000; release bodies 2,000, up to 200 supplied PRs and 20 labels each. These caps supplement configured file/diff/candidate counts. AI HTTP responses are capped at 1 MB; validated arrays and strings have schema limits. There is not yet a persistent per-installation cost quota.
