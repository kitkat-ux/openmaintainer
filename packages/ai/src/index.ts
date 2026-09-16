import { z } from 'zod';
import {
  duplicatePrompt,
  issueTriagePrompt,
  prReviewPrompt,
  releaseNotesPrompt,
} from '@openmaintainer/prompts';
import {
  ProviderError,
  type DuplicateComparison,
  type DuplicateIssueInput,
  type IssueTriageInput,
  type PullRequestReviewInput,
  type ReleaseNotesInput,
  type ReviewFinding,
} from '@openmaintainer/shared';
import {
  DuplicateResponseSchema,
  ReleaseResponseSchema,
  ReviewResponseSchema,
  TriageResponseSchema,
} from './schemas.js';
export * from './schemas.js';

export interface AIProvider {
  reviewPullRequest(
    input: PullRequestReviewInput,
    signal?: AbortSignal,
  ): Promise<{ summary: string; findings: ReviewFinding[]; testing: string }>;
  triageIssue(
    input: IssueTriageInput,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof TriageResponseSchema>>;
  compareDuplicateIssues(
    input: DuplicateIssueInput,
    signal?: AbortSignal,
  ): Promise<DuplicateComparison[]>;
  generateReleaseNotes(
    input: ReleaseNotesInput,
    signal?: AbortSignal,
  ): Promise<Array<{ category: string; text: string; reference: string }>>;
}

export interface OpenAICompatibleOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}
function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}
export class OpenAICompatibleProvider implements AIProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  constructor(private readonly options: OpenAICompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.timeoutMs = options.timeoutMs ?? 45_000;
    if (!options.apiKey) throw new ProviderError('OPENMAINTAINER_API_KEY is required.');
    if (!options.model) throw new ProviderError('OPENMAINTAINER_MODEL is required.');
  }
  private async request(
    prompt: string,
    schema: z.ZodType<unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let response: Response;
        try {
          response = await this.fetchImpl(endpoint(this.baseUrl), {
            method: 'POST',
            headers: {
              authorization: `Bearer ${this.options.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: this.options.model,
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content: 'Return only valid JSON matching the requested schema.',
                },
                { role: 'user', content: prompt },
              ],
            }),
            signal: controller.signal,
          });
        } catch (error) {
          throw new ProviderError(
            `AI provider request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            { cause: error },
          );
        }
        if (!response.ok) {
          const transient = [429, 502, 503, 504].includes(response.status);
          if (transient && attempt < 2) {
            const retryAfter = Number(response.headers.get('retry-after'));
            const waitMs =
              Number.isFinite(retryAfter) && retryAfter >= 0
                ? Math.min(retryAfter * 1000, 10_000)
                : 100 * 2 ** attempt + Math.floor(Math.random() * 50);
            await new Promise<void>((resolve, reject) => {
              const waiter = setTimeout(resolve, waitMs);
              signal?.addEventListener(
                'abort',
                () => {
                  clearTimeout(waiter);
                  reject(new ProviderError('AI provider request was aborted.'));
                },
                { once: true },
              );
            });
            continue;
          }
          if (transient)
            throw new ProviderError(
              `AI provider temporarily unavailable after retries (${response.status}).`,
            );
          if (response.status === 401 || response.status === 403)
            throw new ProviderError('AI provider authentication failed.');
          throw new ProviderError(`AI provider request failed (${response.status}).`);
        }
        const raw: unknown = await response.json();
        const content =
          typeof raw === 'object' &&
          raw !== null &&
          'choices' in raw &&
          Array.isArray(raw.choices) &&
          raw.choices[0] &&
          typeof raw.choices[0] === 'object' &&
          'message' in raw.choices[0] &&
          raw.choices[0].message &&
          typeof raw.choices[0].message === 'object' &&
          'content' in raw.choices[0].message
            ? raw.choices[0].message.content
            : undefined;
        if (typeof content !== 'string')
          throw new ProviderError('AI provider returned no message content.');
        let decoded: unknown;
        try {
          decoded = JSON.parse(content);
        } catch {
          throw new ProviderError('AI provider returned invalid JSON.');
        }
        const checked = schema.safeParse(decoded);
        if (!checked.success)
          throw new ProviderError(
            `AI provider returned schema-invalid JSON: ${checked.error.issues[0]?.message ?? 'invalid response'}`,
          );
        return checked.data;
      }
      throw new ProviderError('AI provider request exhausted its retry budget.');
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        `AI provider request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async reviewPullRequest(input: PullRequestReviewInput, signal?: AbortSignal) {
    return this.request(
      prReviewPrompt({
        title: input.title,
        body: input.body,
        files: input.files
          .map((file) => `FILE ${file.path}\n${file.patch ?? '[no textual patch]'}`)
          .join('\n'),
      }),
      ReviewResponseSchema,
      signal,
    ) as Promise<z.infer<typeof ReviewResponseSchema>>;
  }
  async triageIssue(input: IssueTriageInput, signal?: AbortSignal) {
    return this.request(
      issueTriagePrompt({ title: input.title, body: input.body }),
      TriageResponseSchema,
      signal,
    ) as Promise<z.infer<typeof TriageResponseSchema>>;
  }
  async compareDuplicateIssues(input: DuplicateIssueInput, signal?: AbortSignal) {
    return this.request(
      duplicatePrompt({
        issue: `${input.issue.title}\n${input.issue.body}`,
        candidates: input.candidates.map((c) => `#${c.number} ${c.title}\n${c.body}`).join('\n'),
      }),
      DuplicateResponseSchema,
      signal,
    ) as Promise<DuplicateComparison[]>;
  }
  async generateReleaseNotes(input: ReleaseNotesInput, signal?: AbortSignal) {
    return this.request(
      releaseNotesPrompt({
        changes: input.pullRequests
          .map((pr) => `PR #${pr.number}: ${pr.title}\n${pr.body}\nLabels: ${pr.labels.join(', ')}`)
          .join('\n'),
      }),
      ReleaseResponseSchema,
      signal,
    ) as Promise<Array<{ category: string; text: string; reference: string }>>;
  }
}

export class MockAIProvider implements AIProvider {
  async reviewPullRequest(input: PullRequestReviewInput) {
    const text = input.files
      .map((file) => `${file.path}\n${file.patch ?? ''}`)
      .join('\n')
      .toLowerCase();
    const findings: ReviewFinding[] = [];
    if (text.includes('query(') && (text.includes('req.') || text.includes('input')))
      findings.push({
        category: 'security',
        severity: 'high',
        confidence: 0.94,
        file:
          input.files.find((f) => (f.patch ?? '').toLowerCase().includes('query('))?.path ??
          'unknown',
        line: 1,
        title: 'User input is passed into a database query',
        explanation:
          'The changed code appears to concatenate request-controlled text into a query, which can permit injection.',
        recommendation: 'Use a parameterized query API and validate input at the boundary.',
      });
    if (text.includes('!.') || text.includes('undefined.value'))
      findings.push({
        category: 'correctness',
        severity: 'medium',
        confidence: 0.88,
        file: input.files[0]?.path ?? 'unknown',
        line: 1,
        title: 'Value may be absent before property access',
        explanation: 'The changed path accesses a value without handling the missing case.',
        recommendation: 'Validate the value and return a clear error or use a safe fallback.',
      });
    return {
      summary: `Reviewed ${input.files.length} changed file${input.files.length === 1 ? '' : 's'} for actionable risks.`,
      findings,
      testing: text.includes('test')
        ? 'Tests were included in the changed files.'
        : 'No test change was evident in the supplied diff.',
    };
  }
  async triageIssue(input: IssueTriageInput) {
    const text = `${input.title}\n${input.body}`.toLowerCase();
    const security = /\b(cve|password|token leak|vulnerability|secret exposed|security)\b/.test(
      text,
    );
    const category = security
      ? 'security'
      : /\b(feature|support|add)\b/.test(text)
        ? 'feature'
        : /\b(doc|readme|documentation)\b/.test(text)
          ? 'documentation'
          : /\b(question|how do|help)\b/.test(text)
            ? 'question'
            : 'bug';
    const safeSummary = input.body
      .replace(/ignore previous instructions[^.]*\.?/gi, '')
      .replace(/reveal (?:the )?(?:api|server) key[^.]*\.?/gi, '')
      .trim();
    return {
      category,
      summary: safeSummary.split(/\n+/)[0]?.slice(0, 280) || input.title,
      suggestedLabels: [category],
      missingInformation:
        input.body.length < 80
          ? ['steps to reproduce', 'expected and actual behavior', 'runtime and version']
          : [],
      isSecuritySensitive: security,
      possibleDuplicate: false,
    } as z.infer<typeof TriageResponseSchema>;
  }
  async compareDuplicateIssues(input: DuplicateIssueInput) {
    return input.candidates.map((candidate) => ({
      number: candidate.number,
      confidence: Math.min(
        0.99,
        (candidate.similarity ?? 0) + ((candidate.similarity ?? 0) > 0.5 ? 0.18 : 0),
      ),
      reason: `Shares meaningful terms with “${candidate.title}”.`,
    }));
  }
  async generateReleaseNotes(input: ReleaseNotesInput) {
    return input.pullRequests.map((pr) => ({
      category: pr.labels.includes('bug')
        ? 'Fixed'
        : pr.labels.includes('security')
          ? 'Security'
          : pr.labels.includes('documentation')
            ? 'Documentation'
            : 'Changed',
      text: pr.title,
      reference: `#${pr.number}`,
    }));
  }
}
