# Troubleshooting

- **Invalid GitHub signature:** verify the exact webhook secret, ensure the proxy preserves the raw body, and check that `GITHUB_WEBHOOK_SECRET` is not empty. Do not paste credentials into logs.
- **Private key errors:** preserve the full PEM and convert literal `\\n` sequences to newlines. Do not add quotes that become part of the key.
- **Missing model:** set both `OPENMAINTAINER_API_KEY` and `OPENMAINTAINER_MODEL`; run `openmaintainer doctor`.
- **AI 401/403:** check the provider key, endpoint, model access, and account policy. The key is never printed by the doctor.
- **AI 429/5xx:** respect provider rate limits, lower diff limits, and retry later. Authentication and schema failures are not retried by the adapter.
- **GitHub permission error:** reinstall the App after changing permissions and confirm Contents, Pull requests, Issues, and Metadata permissions.
- **Partial large PR:** increase `maxFiles` or `maxDiffCharacters` carefully, or improve `ignore` patterns. The comment reports skipped paths rather than claiming full coverage.
- **Configuration failure:** run `openmaintainer validate`; errors include the YAML field path.
- **Docker does not start:** check `docker compose logs`, port 3000, `.env`, and `/health`. Secrets are runtime environment only.
