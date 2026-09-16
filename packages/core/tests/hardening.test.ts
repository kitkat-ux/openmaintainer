import { describe, expect, it, vi } from 'vitest';
import { MockAIProvider } from '@openmaintainer/ai';
import { defaultConfig, parseConfig } from '@openmaintainer/config';
import {
  ReviewService,
  DuplicateService,
  ReleaseNotesService,
  IssueTriageService,
  prioritizeFiles,
  commandHelp,
  parseCommand,
  canRunCommand,
  renderTriageComment,
} from '../src/index.js';
const file = (path: string, patch = 'abc') => ({ path, patch, additions: 1, deletions: 0 });
const input = {
  repository: 'a/b',
  number: 1,
  title: 'Test',
  body: '',
  files: [file('src/auth.ts')],
};
describe('ignore and priority semantics', () => {
  it.each([
    ['**/*.lock', ['yarn.lock', 'nested/a.lock'], ['lock.ts']],
    ['dist/**', ['dist/a.js', 'dist/nested/a.js'], ['src/dist/a.js', 'distribution.ts']],
    ['build/**', ['build/a.js'], ['builder.ts']],
    ['coverage/**', ['coverage/a.json'], ['src/coverage.ts']],
    ['vendor/**', ['vendor/lib/a.ts'], ['vendors.ts']],
    ['**/*.min.js', ['a.min.js', 'nested/a.min.js'], ['a.js']],
    [
      'packages/*/dist/**',
      ['packages/a/dist/b.js', 'packages/b/dist/deep/b.js'],
      ['packages/a/src/b.js', 'packages/a/b/dist/c.js'],
    ],
    ['src/generated/**', ['src/generated/a.ts', 'src/generated/deep/a.ts'], ['src/generated.ts']],
  ])('matches root-relative %s', (pattern, ignored, kept) => {
    const result = prioritizeFiles(
      [...ignored, ...kept].map((path) => file(path)),
      100,
      [pattern],
    );
    expect(result.skipped).toEqual(ignored);
    expect(result.files.map((f) => f.path).sort()).toEqual([...kept].sort());
  });
  it('orders sensitive, source, tests, docs, generated deterministically; binaries never sent', () => {
    const paths = [
      'vendor/auth.ts',
      'README.md',
      'src/a.test.ts',
      'src/main.ts',
      'package.json',
      'Dockerfile',
      '.github/workflows/ci.yml',
      'db/migration.sql',
      'src/permission.ts',
      'src/security.ts',
      'src/auth.ts',
    ];
    const files = [...paths.map((path) => file(path)), { ...file('security.bin'), binary: true }];
    const expected = [
      '.github/workflows/ci.yml',
      'Dockerfile',
      'db/migration.sql',
      'package.json',
      'src/auth.ts',
      'src/permission.ts',
      'src/security.ts',
      'src/main.ts',
      'src/a.test.ts',
      'README.md',
      'vendor/auth.ts',
    ];
    for (let i = 0; i < 5; i++)
      expect(
        prioritizeFiles(i % 2 ? files : [...files].reverse(), 100, []).files.map((f) => f.path),
      ).toEqual(expected);
  });
});
it('lists every parser command in help, including release-notes', () => {
  for (const command of ['help', 'review', 'summarize', 'triage', 'duplicates', 'release-notes']) {
    expect(parseCommand(`/om ${command}`)).toBe(command);
    expect(commandHelp()).toContain(`/om ${command}`);
  }
});
it.each(['admin', 'maintain', 'write', 'triage', 'read', 'unknown', undefined])(
  'fails closed for permission %s',
  (role) => {
    expect(canRunCommand(role, defaultConfig)).toBe(
      ['admin', 'maintain', 'write'].includes(role ?? ''),
    );
  },
);
it('marks a single truncated patch partial and no textual inputs skip provider entirely', async () => {
  const provider = new MockAIProvider();
  const spy = vi.spyOn(provider, 'reviewPullRequest');
  const config = parseConfig({ version: 1, review: { maxDiffCharacters: 2 } });
  const service = new ReviewService(provider, config);
  const result = await service.review(input);
  expect(result.partial).toBe(true);
  expect(result.skippedFiles).toContain('src/auth.ts');
  expect(spy.mock.calls[0]?.[0].files[0]?.patch).toBe('ab');
  spy.mockClear();
  expect((await service.review({ ...input, files: [file('dist/a.ts')] })).analyzedFiles).toBe(0);
  expect(spy).not.toHaveBeenCalled();
});
it('enforces confidence, finding cap, focus and actual file grounding', async () => {
  const provider = new MockAIProvider();
  const finding = {
    category: 'security' as const,
    severity: 'high' as const,
    file: 'src/auth.ts',
    title: 'x',
    explanation: 'x',
    recommendation: 'x',
    confidence: 0.9,
  };
  vi.spyOn(provider, 'reviewPullRequest').mockResolvedValue({
    summary: 'x',
    testing: '',
    findings: [
      { ...finding, confidence: 0.1 },
      { ...finding, file: 'invented.ts' },
      { ...finding, category: 'performance' },
      finding,
      finding,
    ],
  });
  const config = parseConfig({ version: 1, review: { focus: ['security'], maxInlineComments: 1 } });
  expect((await new ReviewService(provider, config).review(input)).findings).toHaveLength(1);
  config.review.maxInlineComments = 0;
  expect((await new ReviewService(provider, config).review(input)).findings).toEqual([]);
});
it('bounds duplicate candidates and discards hallucinated, repeated and low confidence numbers', async () => {
  const provider = new MockAIProvider();
  const spy = vi.spyOn(provider, 'compareDuplicateIssues').mockResolvedValue([
    { number: 2, confidence: 0.99, reason: 'x' },
    { number: 2, confidence: 0.99, reason: 'x' },
    { number: 999, confidence: 1, reason: 'fake' },
    { number: 3, confidence: 0.1, reason: 'x' },
  ]);
  const candidates = [1, 2, 3, 4, 5].map((number) => ({
    number,
    title: 'Test',
    body: 'x'.repeat(20_000),
  }));
  const result = await new DuplicateService(
    provider,
    parseConfig({ version: 1, issues: { duplicates: { maxCandidates: 2 } } }),
  ).find(input, candidates);
  expect(spy.mock.calls[0]?.[0].candidates).toHaveLength(2);
  expect(spy.mock.calls[0]?.[0].candidates[0]?.body.length).toBe(10_000);
  expect(result.map((r) => r.number)).toEqual([2]);
});
it('release entries use input titles, not invented prose, PRs, URLs or commit IDs', async () => {
  const provider = new MockAIProvider();
  vi.spyOn(provider, 'generateReleaseNotes').mockResolvedValue([
    { reference: '#2', category: 'Fixed', text: 'Fake item #999 https://evil.invalid deadbeef' },
    { reference: '#999', category: 'Added', text: 'Fake PR' },
    { reference: '#2', category: 'Added', text: 'Duplicate item' },
  ]);
  const result = await new ReleaseNotesService(provider, defaultConfig).generate({
    from: 'v0',
    to: 'HEAD',
    pullRequests: [
      {
        number: 2,
        title: 'Actual fix',
        body: '',
        labels: [],
        url: 'https://github.com/a/b/pull/2',
      },
    ],
  });
  expect(result.changes).toHaveLength(1);
  expect(result.markdown).toContain('Actual fix (#2)');
  expect(result.markdown).not.toMatch(/999|evil|deadbeef|Duplicate/);
});
it('security category suppresses hostile summary even if provider forgets security flag', async () => {
  const provider = new MockAIProvider();
  vi.spyOn(provider, 'triageIssue').mockResolvedValue({
    category: 'security',
    summary: 'Exploit fixture',
    suggestedLabels: ['secret'],
    missingInformation: ['exploit'],
    isSecuritySensitive: false,
    possibleDuplicate: false,
  });
  const result = await new IssueTriageService(provider, defaultConfig).triage(input);
  expect(renderTriageComment(result)).toContain('SECURITY.md');
  expect(renderTriageComment(result)).not.toContain('Exploit fixture');
});
it('all disabled services avoid provider calls', async () => {
  const provider = new MockAIProvider();
  const review = vi.spyOn(provider, 'reviewPullRequest');
  const triage = vi.spyOn(provider, 'triageIssue');
  const dup = vi.spyOn(provider, 'compareDuplicateIssues');
  const release = vi.spyOn(provider, 'generateReleaseNotes');
  const config = parseConfig({
    version: 1,
    review: { enabled: false },
    issues: { enabled: false },
    releaseNotes: { enabled: false },
  });
  await new ReviewService(provider, config).review(input);
  await new IssueTriageService(provider, config).triage(input);
  await new DuplicateService(provider, config).find(input, []);
  await new ReleaseNotesService(provider, config).generate({
    from: 'a',
    to: 'b',
    pullRequests: [],
  });
  for (const spy of [review, triage, dup, release]) expect(spy).not.toHaveBeenCalled();
});

it('rejects oversized release batches before provider work', async () => {
  const provider = new MockAIProvider();
  const spy = vi.spyOn(provider, 'generateReleaseNotes');
  await expect(
    new ReleaseNotesService(provider, defaultConfig).generate({
      from: 'a',
      to: 'b',
      pullRequests: Array.from({ length: 201 }, (_, i) => ({
        number: i + 1,
        title: 'x',
        body: '',
        labels: [],
      })),
    }),
  ).rejects.toThrow('200');
  expect(spy).not.toHaveBeenCalled();
});
it('suppresses sensitive duplicate work independently of triage configuration', async () => {
  const provider = new MockAIProvider();
  const spy = vi.spyOn(provider, 'compareDuplicateIssues');
  expect(
    await new DuplicateService(provider, defaultConfig).find(
      { ...input, title: 'Possible token exposed in logs' },
      [{ number: 2, title: 'Token exposed', body: 'Details' }],
    ),
  ).toEqual([]);
  expect(spy).not.toHaveBeenCalled();
});
it('aggregate diff cap records both truncated and fully omitted paths', async () => {
  const provider = new MockAIProvider();
  const spy = vi.spyOn(provider, 'reviewPullRequest');
  const result = await new ReviewService(
    provider,
    parseConfig({ version: 1, review: { maxDiffCharacters: 4 } }),
  ).review({ ...input, files: [file('src/auth.ts', '12345678'), file('src/main.ts', 'abc')] });
  expect(result.partial).toBe(true);
  expect(result.skippedFiles).toEqual(['src/auth.ts', 'src/main.ts']);
  expect(spy.mock.calls[0]?.[0].files).toHaveLength(1);
});
