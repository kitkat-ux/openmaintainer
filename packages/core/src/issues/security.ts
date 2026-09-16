import type { IssueTriageInput } from '@openmaintainer/shared';
/** Conservative heuristic, not a security classifier guarantee. */
export function isSecuritySensitiveIssue(issue: IssueTriageInput): boolean {
  return /\b(security|vulnerability|cve|exploit|(?:token|secret).{0,30}(?:expos|leak))|(?:expos|leak).{0,30}(?:token|secret)/i.test(
    `${issue.title} ${issue.body}`,
  );
}
