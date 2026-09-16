import { describe, expect, it } from 'vitest';
import { MockAIProvider } from '@openmaintainer/ai';
import { defaultConfig } from '@openmaintainer/config';
import {
  DuplicateService,
  IssueTriageService,
  ReviewService,
  canRunCommand,
  calculateRisk,
  parseCommand,
  prioritizeFiles,
  renderReviewComment,
} from '../src/index.js';
describe('core workflows', () => {
  it('prioritizes sensitive source and skips generated files', () => {
    const result = prioritizeFiles(
      [
        { path: 'dist/app.js', additions: 1, deletions: 0, patch: 'x' },
        { path: 'src/auth.ts', additions: 1, deletions: 0, patch: 'x' },
        { path: 'README.md', additions: 1, deletions: 0, patch: 'x' },
      ],
      2,
      ['dist/**'],
    );
    expect(result.files.map((f) => f.path)).toEqual(['src/auth.ts', 'README.md']);
    expect(result.skipped).toContain('dist/app.js');
  });
  it('filters low confidence findings and marks partial analysis', async () => {
    const config = { ...defaultConfig, review: { ...defaultConfig.review, maxFiles: 1 } };
    const result = await new ReviewService(new MockAIProvider(), config).review({
      repository: 'a/b',
      number: 1,
      title: 'Fix',
      body: '',
      files: [
        {
          path: 'src/a.ts',
          additions: 1,
          deletions: 0,
          patch: 'const x = req.input; db.query(input)',
        },
        { path: 'src/b.ts', additions: 1, deletions: 0, patch: 'harmless' },
      ],
    });
    expect(result.partial).toBe(true);
    expect(result.findings[0]?.confidence).toBeGreaterThanOrEqual(0.72);
    expect(renderReviewComment(result)).toContain('OpenMaintainer Review');
  });
  it('triages issues and ranks duplicates', async () => {
    const provider = new MockAIProvider();
    const issue = {
      repository: 'a/b',
      number: 3,
      title: 'Search fails for apostrophes',
      body: 'Database query fails when a name has punctuation.',
    };
    expect((await new IssueTriageService(provider, defaultConfig).triage(issue)).category).toBe(
      'bug',
    );
    const duplicates = await new DuplicateService(provider, defaultConfig).find(issue, [
      {
        number: 1,
        title: 'Search fails for apostrophes',
        body: 'Database query fails when a name has punctuation. Search fails for apostrophes.',
      },
    ]);
    expect(duplicates[0]?.confidence).toBeGreaterThan(0.82);
  });
  it('parses commands and permission gates', () => {
    expect(parseCommand('/om review')).toBe('review');
    expect(parseCommand('/om')).toBe('help');
    expect(parseCommand('/om unknown')).toBeUndefined();
    expect(canRunCommand('write', defaultConfig)).toBe(true);
    expect(canRunCommand('read', defaultConfig)).toBe(false);
  });
  it('calculates advisory risk', () => {
    expect(
      calculateRisk({
        files: [{ path: 'src/auth.ts', additions: 1, deletions: 0 }],
        findings: [
          {
            category: 'security',
            severity: 'high',
            confidence: 1,
            file: 'src/auth.ts',
            title: 'x',
            explanation: 'x',
            recommendation: 'x',
          },
        ],
      }),
    ).toBe('high');
  });
});
