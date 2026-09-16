# Configuration reference

Configuration is YAML in `.openmaintainer.yml`. The schema has a required `version: 1` and rejects unknown top-level keys. Run `openmaintainer validate` after editing.

| Setting                               | Type / default                                               | Meaning                                                             |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `version`                             | literal `1`                                                  | Configuration schema major version.                                 |
| `review.enabled`                      | boolean, `true`                                              | Enable automatic PR review.                                         |
| `review.drafts`                       | boolean, `false`                                             | Review draft PRs when true.                                         |
| `review.minimumConfidence`            | number 0–1, `0.72`                                           | Minimum finding confidence to retain.                               |
| `review.maxInlineComments`            | integer, `8`                                                 | Maximum actionable findings in the summary.                         |
| `review.maxFiles`                     | integer, `50`                                                | Maximum eligible files to send to a provider.                       |
| `review.maxDiffCharacters`            | integer, `120000`                                            | Bounded aggregate textual diff.                                     |
| `review.focus`                        | list, correctness/security/tests/performance/maintainability | Focus hints for configuration consumers.                            |
| `review.ignore`                       | list of glob-like patterns                                   | Skip lockfiles, generated, vendor, and binary paths.                |
| `issues.enabled`                      | boolean, `true`                                              | Master issue feature switch.                                        |
| `issues.triage.enabled`               | boolean, `true`                                              | Enable categorization comments.                                     |
| `issues.duplicates.enabled`           | boolean, `true`                                              | Enable candidate comparison.                                        |
| `issues.duplicates.minimumConfidence` | number, `0.82`                                               | Confidence required before suggesting a duplicate.                  |
| `issues.duplicates.maxCandidates`     | integer, `5`                                                 | Candidate limit sent to the provider.                               |
| `commands.enabled`                    | boolean, `true`                                              | Enable maintainer commands.                                         |
| `commands.prefix`                     | `/`-prefixed string, `/om`                                   | Comment command prefix.                                             |
| `commands.allowedRoles`               | admin/maintain/write list                                    | Roles allowed to invoke expensive commands.                         |
| `releaseNotes.enabled`                | boolean, `true`                                              | Enable Markdown generation.                                         |
| `privacy.telemetry`                   | boolean, `false`                                             | Reserved privacy switch; no telemetry is emitted in v0.1.           |
| `privacy.debugPrompts`                | boolean, `false`                                             | Reserved explicit debug switch; prompts remain out of logs in v0.1. |

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

A missing file means conservative built-in defaults. Invalid YAML, unknown keys, unsupported versions, or out-of-range values fail with field paths and a non-zero CLI exit code.
