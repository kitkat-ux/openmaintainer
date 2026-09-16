import { type IssueTriageResult, marker } from '@openmaintainer/shared';
import { BOT_FOOTER } from '../footer.js';
export function renderTriageComment(result: IssueTriageResult): string {
  if (result.isSecuritySensitive || result.category === 'security')
    return `${marker('issue-triage')}\n## OpenMaintainer Triage\n\nThis report may be security-sensitive. Please consult SECURITY.md and use the repository's private vulnerability reporting channel. Do not post exploit details publicly.\n\n${BOT_FOOTER}`;
  const missing = result.missingInformation.length
    ? `\n\n**Helpful missing information:** ${result.missingInformation.join(', ')}.`
    : '';
  return `${marker('issue-triage')}\n## OpenMaintainer Triage\n\n**Category:** ${result.category}\n\n${result.summary}\n\n**Suggested labels:** ${result.suggestedLabels.length ? result.suggestedLabels.map((label) => `\`${label}\``).join(', ') : 'None'}${missing}\n\n${BOT_FOOTER}`;
}
