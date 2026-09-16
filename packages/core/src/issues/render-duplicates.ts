import {
  type DuplicateCandidate,
  type DuplicateComparison,
  marker,
  sanitizeMarkdown,
} from '@openmaintainer/shared';
import { BOT_FOOTER } from '../footer.js';
export function renderDuplicateComment(
  results: DuplicateComparison[],
  candidates: DuplicateCandidate[],
): string {
  const links = results
    .map((result) => {
      const candidate = candidates.find((item) => item.number === result.number);
      return `- Possible duplicate: ${candidate?.url ?? `#${result.number}`} (${Math.round(result.confidence * 100)}% confidence) — ${sanitizeMarkdown(result.reason)}`;
    })
    .join('\n');
  return `${marker('duplicates')}\n## OpenMaintainer Duplicate Check\n\n${links || 'No high-confidence duplicate candidates were identified.'}\n\n${BOT_FOOTER}`;
}
