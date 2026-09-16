# Privacy

OpenMaintainer has no telemetry service and telemetry is disabled by default. It is self-hosted: operators control the process, network, environment, and log destination.

## Data that may be processed

Depending on the enabled workflow: PR title/body, selected changed-file paths and bounded textual patches, issue title/body, a bounded set of candidate issue titles/bodies, labels, PR titles/bodies, and commit/merge metadata used for release notes. Binary files, configured generated paths, lockfiles, and unrelated repository history are skipped by default.

## Data sent to a provider

The configured `AIProvider` receives only the bounded input for its requested operation. The OpenAI-compatible adapter sends the prompt and model name to its configured base URL. API keys are sent in an HTTP authorization header, never in prompt text, comments, or logs. Provider retention and training behavior is controlled by that provider, not promised by this repository.

## Logs

Structured logs may include event type, delivery ID, repository name, operation, duration, and safe outcome. They do not intentionally include API keys, private keys, authorization headers, raw prompts, or complete private repository contents. Prompt logging is unsupported; `privacy.debugPrompts` and `privacy.telemetry` accept only false.

To minimize data, disable individual workflows, lower `maxFiles` and `maxDiffCharacters`, expand ignore patterns, use a self-hosted provider endpoint, and avoid installing the App on repositories whose policy disallows external processing.
