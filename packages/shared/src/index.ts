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
  patch?: string;
  additions: number;
  deletions: number;
  binary?: boolean;
}
export interface PullRequestReviewInput {
  repository: string;
  number: number;
  title: string;
  body: string;
  baseRef?: string;
  headRef?: string;
  files: PullRequestFile[];
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
  url?: string;
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
  url?: string;
}
export interface ReleaseNotesInput {
  from: string;
  to: string;
  pullRequests: Array<{
    number: number;
    title: string;
    body: string;
    labels: string[];
    url?: string;
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
  return `${value.slice(0, Math.max(0, max - 24))}\n...[truncated by OpenMaintainer]`;
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
export function sanitizeMarkdown(value: string): string {
  return value
    .replace(/@(everyone|here)\b/gi, '@\\$1')
    .replace(/<!--[\s\S]*?-->/g, '')
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
        /key|token|secret|authorization|password/i.test(k) ? k : k,
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
  if (!signature?.startsWith('sha256=') || !secret) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const received = Buffer.from(signature);
  const actual = Buffer.from(expected);
  return received.length === actual.length && timingSafeEqual(received, actual);
}
export function marker(name: string): string {
  return `<!-- openmaintainer:${name} -->`;
}
