import { isSecuritySensitiveIssue } from './security.js';
import { DuplicateResponseSchema } from '@openmaintainer/ai';
import {
  type DuplicateCandidate,
  type DuplicateIssueInput,
  type DuplicateComparison,
  type IssueTriageInput,
  jaccardSimilarity,
} from '@openmaintainer/shared';
import type { AIProvider } from '@openmaintainer/ai';
import type { OpenMaintainerConfig } from '@openmaintainer/config';
export class DuplicateService {
  constructor(
    private readonly provider: AIProvider,
    private readonly config: OpenMaintainerConfig,
  ) {}
  async find(
    issue: IssueTriageInput,
    candidates: DuplicateCandidate[],
  ): Promise<DuplicateComparison[]> {
    if (
      !this.config.issues.enabled ||
      !this.config.issues.duplicates.enabled ||
      isSecuritySensitiveIssue(issue)
    )
      return [];
    const ranked = candidates
      .filter((candidate) => candidate.number !== issue.number)
      .map((candidate) => ({
        ...candidate,
        title: candidate.title.slice(0, 500),
        body: candidate.body.slice(0, 10_000),
        similarity: jaccardSimilarity(
          `${issue.title} ${issue.body}`,
          `${candidate.title} ${candidate.body}`,
        ),
      }))
      .sort((a, b) => b.similarity - a.similarity || a.number - b.number)
      .slice(0, this.config.issues.duplicates.maxCandidates);
    if (!ranked.length) return [];
    const comparisons = DuplicateResponseSchema.parse(
      await this.provider.compareDuplicateIssues({
        issue: {
          ...issue,
          title: issue.title.slice(0, 500),
          body: issue.body.slice(0, 20_000),
          comments: [],
        },
        candidates: ranked,
      } satisfies DuplicateIssueInput),
    );
    return comparisons
      .filter(
        (comparison, index, all) =>
          ranked.some((c) => c.number === comparison.number) &&
          all.findIndex((c) => c.number === comparison.number) === index &&
          comparison.confidence >= this.config.issues.duplicates.minimumConfidence,
      )
      .sort((a, b) => b.confidence - a.confidence);
  }
}
