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
