import { ReviewResponseSchema } from '@openmaintainer/ai';
import {
  type PullRequestReviewInput,
  type PullRequestReviewResult,
  sanitizeMarkdown,
  truncate,
} from '@openmaintainer/shared';
import type { AIProvider } from '@openmaintainer/ai';
import type { OpenMaintainerConfig } from '@openmaintainer/config';
import { prioritizeFiles } from './prioritize-files.js';
import { calculateRisk } from './risk.js';
export class ReviewService {
  constructor(
    private readonly provider: AIProvider,
    private readonly config: OpenMaintainerConfig,
  ) {}
  async review(input: PullRequestReviewInput): Promise<PullRequestReviewResult> {
    if (!this.config.review.enabled)
      return {
        summary: 'Pull request review is disabled by configuration.',
        findings: [],
        testing: '',
        risk: 'low',
        partial: false,
        analyzedFiles: 0,
        skippedFiles: [],
      };
    const chosen = prioritizeFiles(
      input.files,
      this.config.review.maxFiles,
      this.config.review.ignore,
    );
    const maxChars = this.config.review.maxDiffCharacters;
    let used = 0;
    const omitted = [...chosen.skipped];
    const bounded = chosen.files
      .map((file) => {
        const patch = file.patch ?? '';
        const remaining = maxChars - used;
        if (!patch || patch.length > remaining) omitted.push(file.path);
        if (remaining <= 0) return { ...file, patch: '' };
        const next = patch.slice(0, remaining);
        used += next.length;
        return { ...file, patch: next };
      })
      .filter((file) => file.patch !== '');
    const partial = omitted.length > 0;
    const providerResult = bounded.length
      ? ReviewResponseSchema.parse(
          await this.provider.reviewPullRequest({
            ...input,
            title: input.title.slice(0, 500),
            body: input.body.slice(0, 20_000),
            files: bounded,
            focus: this.config.review.focus,
          }),
        )
      : {
          summary: 'No eligible textual changes were available for analysis.',
          findings: [],
          testing: '',
        };
    const findings = providerResult.findings
      .filter(
        (finding) =>
          finding.confidence >= this.config.review.minimumConfidence &&
          bounded.some((file) => file.path === finding.file) &&
          this.config.review.focus.includes(
            (finding.category === 'testing'
              ? 'tests'
              : ['reliability', 'compatibility'].includes(finding.category)
                ? 'correctness'
                : finding.category === 'documentation'
                  ? 'maintainability'
                  : finding.category) as (typeof this.config.review.focus)[number],
          ),
      )
      .slice(0, this.config.review.maxInlineComments);
    return {
      summary: sanitizeMarkdown(truncate(providerResult.summary, 2000)),
      findings: findings.map((finding) => ({
        ...finding,
        file: sanitizeMarkdown(finding.file),
        title: sanitizeMarkdown(finding.title),
        explanation: sanitizeMarkdown(finding.explanation),
        recommendation: sanitizeMarkdown(finding.recommendation),
      })),
      testing: sanitizeMarkdown(truncate(providerResult.testing, 1500)),
      risk: calculateRisk({ files: bounded, findings, partial }),
      partial,
      analyzedFiles: bounded.length,
      skippedFiles: omitted.map(sanitizeMarkdown),
    };
  }
}
