import { isSecuritySensitiveIssue } from './security.js';
import { TriageResponseSchema } from '@openmaintainer/ai';
import {
  type IssueTriageInput,
  type IssueTriageResult,
  sanitizeMarkdown,
  truncate,
} from '@openmaintainer/shared';
import type { AIProvider } from '@openmaintainer/ai';
import type { OpenMaintainerConfig } from '@openmaintainer/config';
export class IssueTriageService {
  constructor(
    private readonly provider: AIProvider,
    private readonly config: OpenMaintainerConfig,
  ) {}
  async triage(input: IssueTriageInput): Promise<IssueTriageResult> {
    if (!this.config.issues.enabled || !this.config.issues.triage.enabled)
      return {
        category: 'other',
        summary: 'Issue triage is disabled by configuration.',
        suggestedLabels: [],
        missingInformation: [],
        isSecuritySensitive: false,
        possibleDuplicate: false,
      };
    const result = TriageResponseSchema.parse(
      await this.provider.triageIssue({
        ...input,
        title: input.title.slice(0, 500),
        body: input.body.slice(0, 20_000),
        comments: [],
      }),
    );
    if (
      result.isSecuritySensitive ||
      result.category === 'security' ||
      isSecuritySensitiveIssue(input)
    ) {
      return {
        category: 'security',
        summary:
          'This report may contain security-sensitive information. Please consult SECURITY.md and use private vulnerability reporting.',
        suggestedLabels: ['security'],
        missingInformation: [],
        isSecuritySensitive: true,
        possibleDuplicate: false,
      };
    }
    return {
      ...result,
      summary: sanitizeMarkdown(truncate(result.summary, 1000)),
      suggestedLabels: result.suggestedLabels
        .map((label) => label.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 50))
        .filter(Boolean),
      missingInformation: result.missingInformation.map((item) =>
        sanitizeMarkdown(item).slice(0, 200),
      ),
    };
  }
}
