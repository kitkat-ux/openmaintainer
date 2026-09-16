import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const SeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof SeveritySchema>;
export const FindingCategorySchema = z.enum([
  'correctness',
  'security',
  'performance',
  'testing',
  'reliability',
  'maintainability',
  'compatibility',
  'documentation',
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;
export const RiskSchema = z.enum(['low', 'medium', 'high']);
export type Risk = z.infer<typeof RiskSchema>;

export const ReviewFindingSchema = z.object({
  category: FindingCategorySchema,
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  file: z.string().min(1).max(500),
  line: z.number().int().positive().optional(),
  title: z.string().min(1).max(300),
  explanation: z.string().min(1).max(3000),
  recommendation: z.string().min(1).max(2000),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export interface PullRequestFile {
  path: string;
  patch?: string | undefined;
  additions: number;
  deletions: number;
  binary?: boolean | undefined;
}
export interface PullRequestReviewInput {
  repository: string;
  number: number;
  title: string;
  body: string;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  files: PullRequestFile[];
  focus?: string[];
}
export interface PullRequestReviewResult {
  summary: string;
  findings: ReviewFinding[];
  testing: string;
  risk: Risk;
  partial: boolean;
  analyzedFiles: number;
  skippedFiles: string[];
}
export interface IssueTriageInput {
  repository: string;
  number: number;
  title: string;
  body: string;
  comments?: string[];
}
export const IssueCategorySchema = z.enum([
  'bug',
  'feature',
  'documentation',
  'question',
  'performance',
  'security',
  'dependency',
  'other',
]);
export type IssueCategory = z.infer<typeof IssueCategorySchema>;
export interface IssueTriageResult {
  category: IssueCategory;
  summary: string;
  suggestedLabels: string[];
  missingInformation: string[];
  isSecuritySensitive: boolean;
  possibleDuplicate: boolean;
}
export interface DuplicateCandidate {
  number: number;
  title: string;
  body: string;
  url?: string | undefined;
  similarity?: number;
}
export interface DuplicateComparison {
  number: number;
  confidence: number;
  reason: string;
}
export interface DuplicateIssueInput {
  issue: IssueTriageInput;
  candidates: DuplicateCandidate[];
}
export interface ReleaseChange {
  category: string;
  text: string;
  reference: string;
  url?: string | undefined;
}
export interface ReleaseNotesInput {
  from: string;
  to: string;
  pullRequests: Array<{
    number: number;
    title: string;
    body: string;
    labels: string[];
    url?: string | undefined;
    mergedAt?: string;
  }>;
}
export interface ReleaseNotesResult {
  markdown: string;
  changes: ReleaseChange[];
}

export class OpenMaintainerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
export class ConfigurationError extends OpenMaintainerError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
  }
}
export class ProviderError extends OpenMaintainerError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'PROVIDER_ERROR', options);
  }
}
export class GitHubApiError extends OpenMaintainerError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'GITHUB_API_ERROR', options);
  }
}
export class PermissionError extends OpenMaintainerError {
  constructor(message: string) {
    super(message, 'PERMISSION_ERROR');
  }
}
export class ValidationError extends OpenMaintainerError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}
export class RateLimitError extends OpenMaintainerError {
  constructor(message: string) {
    super(message, 'RATE_LIMIT_ERROR');
  }
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const suffix = '\n...[truncated by OpenMaintainer]';
  return max <= suffix.length
    ? value.slice(0, max)
    : `${value.slice(0, max - suffix.length)}${suffix}`;
}
export function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9_/-]+/g, ' ')
      .split(/\s+/)
      .filter((part) => part.length > 2),
  );
}
export function jaccardSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
/** Single forward scan: repeated unclosed comment openers cannot trigger regex backtracking. */
function stripHtmlComments(value: string): string {
  const parts: string[] = [];
  let offset = 0;
  for (;;) {
    const start = value.indexOf('<!--', offset);
    if (start === -1) {
      parts.push(value.slice(offset));
      break;
    }
    parts.push(value.slice(offset, start));
    const end = value.indexOf('-->', start + 4);
    if (end === -1) break;
    offset = end + 3;
  }
  return parts.join('');
}
export function sanitizeMarkdown(value: string): string {
  // Preserve code spans/fences verbatim; they do not create GitHub mentions or HTML.
  return value
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : stripHtmlComments(part)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/@(?=[a-z0-9])/gi, '@\u200b'),
    )
    .join('')
    .replace(/\r/g, '');
}
export function redact(value: unknown): unknown {
  if (typeof value === 'string')
    return value
      .replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(
        /(api[_-]?key|private[_-]?key|authorization)(\s*[:=]\s*)[^,\s]+/gi,
        '$1$2[REDACTED]',
      );
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /key|token|secret|authorization|password/i.test(k) ? '[REDACTED]' : redact(v),
      ]),
    );
  return value;
}
export function verifyGithubSignature(
  payload: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature) || !secret) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const received = Buffer.from(signature);
  const actual = Buffer.from(expected);
  return received.length === actual.length && timingSafeEqual(received, actual);
}
export function marker(name: string): string {
  return `<!-- openmaintainer:${name} -->`;
}

// Local JSON fixtures are untrusted too. Bounds prevent accidentally reading enormous inputs
// into provider workflows; core applies tighter per-operation budgets after prioritization.
export const PullRequestFileSchema = z.object({
  path: z.string().min(1).max(500),
  patch: z.string().max(2_000_000).optional(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  binary: z.boolean().optional(),
});
export const PullRequestInputSchema = z.object({
  repository: z.string().min(3).max(300),
  number: z.number().int().positive(),
  title: z.string().max(500),
  body: z.string().max(100_000),
  baseRef: z.string().optional(),
  headRef: z.string().optional(),
  files: z.array(PullRequestFileSchema).max(3000),
});
export const IssueInputSchema = z.object({
  repository: z.string().min(3).max(300),
  number: z.number().int().positive(),
  title: z.string().max(500),
  body: z.string().max(100_000),
});
export const MergedPullRequestsSchema = z
  .array(
    z.object({
      number: z.number().int().positive(),
      title: z.string().min(1).max(500),
      body: z.string().max(100_000),
      labels: z.array(z.string().max(100)).max(100),
      url: z.string().url().max(1000).optional(),
    }),
  )
  .max(200);
