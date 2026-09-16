import { type PullRequestReviewResult, marker } from '@openmaintainer/shared';
import { BOT_FOOTER } from '../footer.js';
export function renderReviewComment(result: PullRequestReviewResult): string {
  const findings = result.findings.length
    ? result.findings
        .map(
          (f, i) =>
            `${i + 1}. **${f.severity} / ${f.category} — ${f.title}**${f.line ? ` ([${f.file}:${f.line}])` : ` (${f.file})`}\n   ${f.explanation}\n   **Recommendation:** ${f.recommendation}`,
        )
        .join('\n\n')
    : 'No high-confidence actionable issues were identified.';
  const partial = result.partial
    ? `\n\n> Partial analysis: ${result.analyzedFiles} file(s) were analyzed. Skipped or truncated paths: ${result.skippedFiles.slice(0, 20).join(', ') || 'diff size limit'}.`
    : '';
  return `${marker('pr-review')}\n## OpenMaintainer Review\n\n### Summary\n${result.summary}\n\n### Risk\n**${result.risk.charAt(0).toUpperCase()}${result.risk.slice(1)}**\n\n### Findings (${result.findings.length})\n${findings}\n\n### Testing\n${result.testing || 'No testing information was returned.'}${partial}\n\n${BOT_FOOTER}`;
}
