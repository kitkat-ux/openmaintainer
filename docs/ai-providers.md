# AI providers

Core depends on the small `AIProvider` interface in `packages/ai/src/index.ts`, not on an AI vendor SDK. The interface covers pull-request review, issue triage, duplicate comparison, and release notes. Every response is validated with Zod before core can render it.

## OpenAI-compatible endpoint

Set:

```bash
OPENMAINTAINER_API_KEY=...
OPENMAINTAINER_MODEL=your-model
OPENMAINTAINER_BASE_URL=https://api.openai.com/v1
```

The adapter calls `/chat/completions`, requests JSON output, uses a timeout, maps authentication and transient errors, and rejects malformed JSON or schemas. Providers must support text input and reliable structured JSON. A provider may receive bounded PR diffs, issue text, candidate issue text, or merged PR metadata depending on the workflow.

## Adding a provider

Implement `AIProvider` in a new package or module:

```ts
class LocalProvider implements AIProvider {
  reviewPullRequest(input) {
    /* return validated structured data */
  }
  triageIssue(input) {
    /* ... */
  }
  compareDuplicateIssues(input) {
    /* ... */
  }
  generateReleaseNotes(input) {
    /* ... */
  }
}
```

Validate provider-native output at the adapter boundary, keep credentials out of prompts and logs, add offline tests, then inject the adapter from the app or CLI. GitHub event handling and core workflows should not change.

## Transport and output contract

The overall deadline is 45 seconds by default, including retry waits and response reads. HTTP 429/502/503/504 allow two retries (three attempts total). Missing/malformed `Retry-After` uses 100ms × 2^attempt plus 0–49ms jitter; numeric seconds and HTTP dates are supported and capped at 10 seconds. Authentication, permission, network, schema and JSON errors are not retried. Abort signals and timeouts stop waits; errors do not include raw upstream messages or causes.

Because `response_format: json_object` requires an object, duplicate and release HTTP responses use `{ "items": [...] }`. The public `AIProvider` methods still return arrays. PR and triage return objects directly. No real provider endpoint has been exercised by the offline suite; providers differ in structured-output support.

Release categories come from validated model output, but public entry text and links come only from supplied PR metadata. Unknown and repeated references are discarded. Model-written prose is intentionally not published: a valid reference alone cannot prove a generated claim is factual. The caller must supply genuinely merged PRs; the CLI does not verify merge state with GitHub.
