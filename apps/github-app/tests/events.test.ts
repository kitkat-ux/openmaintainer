import { afterEach, describe, expect, it } from 'vitest';
import { harness } from './harness.js';
import { marker } from '@openmaintainer/shared';
const open: ReturnType<typeof harness>[] = [];
function setup() {
  const h = harness();
  open.push(h);
  return h;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((h) => h.app.close()));
});
describe('signed webhook → core → mock provider → real Octokit adapter → comments', () => {
  it('creates on PR opened and updates the exact own marker on synchronize', async () => {
    const h = setup();
    expect((await h.send('pull_request', h.pr(), 'one')).statusCode).toBe(200);
    expect((await h.send('pull_request', h.pr('synchronize'), 'two')).statusCode).toBe(200);
    expect(h.review).toHaveBeenCalledTimes(2);
    expect(h.state.comments).toHaveLength(1);
    expect(h.state.comments[0]?.body).toContain(`${marker('pr-review')}\n## OpenMaintainer Review`);
    expect(h.state.comments[0]?.body).toContain('User input is passed into a database query');
    expect(h.state.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(h.state.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });
  it('triages and deduplicates issue comments across reopened events', async () => {
    const h = setup();
    await h.send('issues', h.issue());
    await h.send('issues', { ...h.issue(), action: 'reopened' });
    expect(h.triage).toHaveBeenCalledTimes(2);
    expect(h.duplicates).toHaveBeenCalledTimes(2);
    expect(h.state.comments).toHaveLength(2);
    expect(
      h.state.comments.filter((c) => c.body.startsWith(`${marker('issue-triage')}\n`)),
    ).toHaveLength(1);
    expect(h.state.comments.find((c) => c.body.includes('Duplicate Check'))?.body).toContain(
      '/issues/7',
    );
  });
  it.each(['payload', 'adapter'])('ignores draft PR using %s truth', async (source) => {
    const h = setup();
    const event = h.pr();
    if (source === 'payload') event.pull_request.draft = true;
    else h.state.draft = true;
    await h.send('pull_request', event);
    expect(h.review).not.toHaveBeenCalled();
  });
  it('reviews drafts when explicitly configured', async () => {
    const h = setup();
    h.config.review.drafts = true;
    h.state.draft = true;
    await h.send('pull_request', h.pr());
    expect(h.review).toHaveBeenCalledOnce();
  });
  it.each(['admin', 'maintain', 'write', 'triage', 'read', 'unknown'])(
    'checks actual %s permission before AI',
    async (role) => {
      const h = setup();
      h.state.role = role;
      const response = await h.send('issue_comment', h.comment());
      expect(response.statusCode).toBe(200);
      expect(h.review).toHaveBeenCalledTimes(['admin', 'maintain', 'write'].includes(role) ? 1 : 0);
      expect(h.state.calls[0]?.path).toContain('/collaborators/maintainer/permission');
    },
  );
  it('allows triage only with explicit opt-in', async () => {
    const h = setup();
    h.state.role = 'triage';
    h.config.commands.allowedRoles.push('triage');
    await h.send('issue_comment', h.comment());
    expect(h.review).toHaveBeenCalledOnce();
  });
  it.each(['hello review', '/other review', '/om unknown'])(
    'does not execute %s or look up permissions',
    async (command) => {
      const h = setup();
      await h.send('issue_comment', h.comment(command));
      expect(h.state.calls).toHaveLength(0);
      expect(h.review).not.toHaveBeenCalled();
    },
  );
  it('respects a custom prefix, disabled commands and issue type', async () => {
    const h = setup();
    h.config.commands.prefix = '/maintain';
    await h.send('issue_comment', h.comment('/om review'));
    expect(h.review).not.toHaveBeenCalled();
    await h.send('issue_comment', h.comment('/maintain review'));
    expect(h.review).toHaveBeenCalledOnce();
    h.config.commands.enabled = false;
    await h.send('issue_comment', h.comment('/maintain review'));
    expect(h.review).toHaveBeenCalledOnce();
    h.config.commands.enabled = true;
    await h.send('issue_comment', { ...h.comment('/maintain review'), issue: { number: 1 } });
    expect(h.review).toHaveBeenCalledOnce();
  });
  it.each(['help', 'release-notes'])(
    'implements /om %s without provider calls',
    async (command) => {
      const h = setup();
      await h.send('issue_comment', h.comment(`/om ${command}`));
      expect(h.state.comments[0]?.body).toContain('release-notes');
      expect(h.review).not.toHaveBeenCalled();
      await h.send('issue_comment', h.comment(`/om ${command}`));
      expect(h.state.comments).toHaveLength(1);
    },
  );
  it.each(['sender', 'comment', 'edited'])('prevents bot/event loops: %s', async (source) => {
    const h = setup();
    const payload = h.comment();
    if (source === 'sender') payload.sender.type = 'Bot';
    if (source === 'comment') payload.comment.user.type = 'Bot';
    if (source === 'edited') payload.action = 'edited';
    await h.send('issue_comment', payload);
    expect(h.adapterFactory).not.toHaveBeenCalled();
    expect(h.review).not.toHaveBeenCalled();
  });
  it('ignores bot-caused PR events', async () => {
    const h = setup();
    await h.send('pull_request', { ...h.pr(), sender: { type: 'Bot' } });
    expect(h.review).not.toHaveBeenCalled();
  });
  it('coalesces concurrent redeliveries and serializes distinct deliveries per issue', async () => {
    const h = setup();
    await Promise.all([
      h.send('pull_request', h.pr(), 'one'),
      h.send('pull_request', h.pr(), 'one'),
      h.send('pull_request', h.pr('synchronize'), 'two'),
    ]);
    await h.send('pull_request', h.pr(), 'one');
    expect(h.review).toHaveBeenCalledTimes(2);
    expect(h.state.comments).toHaveLength(1);
  });
  it('does not hijack other bots, users, or inexact markers', async () => {
    const h = setup();
    h.state.comments.push(
      {
        id: 1,
        body: `${marker('pr-review')}\nother app`,
        user: { type: 'Bot' },
        performed_via_github_app: { id: 999 },
      },
      {
        id: 2,
        body: `${marker('pr-review')}\nhuman`,
        user: { type: 'User' },
        performed_via_github_app: { id: 123 },
      },
      {
        id: 3,
        body: `Quoted ${marker('pr-review')}\n`,
        user: { type: 'Bot' },
        performed_via_github_app: { id: 123 },
      },
    );
    await h.send('pull_request', h.pr());
    expect(h.state.comments).toHaveLength(4);
    expect(h.state.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });
  it('fails safely on provider errors and permits a redelivery', async () => {
    const h = setup();
    h.review.mockRejectedValueOnce(new Error('fixture-secret should not be returned'));
    const response = await h.send('pull_request', h.pr(), 'retry');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('fixture-secret');
    expect(h.state.comments).toHaveLength(0);
    expect((await h.send('pull_request', h.pr(), 'retry')).statusCode).toBe(200);
    expect(h.review).toHaveBeenCalledTimes(2);
  });
  it('validates even custom provider output before use', async () => {
    const h = setup();
    h.review.mockResolvedValueOnce({ summary: 'x', findings: null, testing: '' } as never);
    expect((await h.send('pull_request', h.pr())).statusCode).toBe(503);
    expect(h.state.comments).toHaveLength(0);
  });
  it('marks truncated/large PR partial and sends only sensitive files within both limits', async () => {
    const h = setup();
    h.config.review.maxFiles = 1;
    h.config.review.maxDiffCharacters = 5;
    h.state.files.unshift({
      filename: 'README.md',
      patch: 'docs',
      additions: 1,
      deletions: 0,
      changes: 1,
    });
    await h.send('pull_request', h.pr());
    expect(h.review.mock.calls[0]?.[0].files).toEqual([
      expect.objectContaining({ path: 'src/auth.ts', patch: '+ db.' }),
    ]);
    expect(h.state.comments[0]?.body).toContain('Partial analysis: 1 file(s)');
    expect(h.state.comments[0]?.body).toContain('README.md');
  });
  it('does not repeat security details or run duplicate comparison for a sensitive report', async () => {
    const h = setup();
    h.state.issue = {
      title: 'Security vulnerability',
      body: 'Exploit details fixture-do-not-repeat',
    };
    await h.send('issues', h.issue());
    expect(h.state.comments[0]?.body).toContain('SECURITY.md');
    expect(h.state.comments[0]?.body).not.toContain('fixture-do-not-repeat');
    expect(h.duplicates).not.toHaveBeenCalled();
  });
  it('respects issue master switch and independent duplicates switch', async () => {
    const h = setup();
    h.config.issues.enabled = false;
    await h.send('issues', h.issue());
    expect(h.triage).not.toHaveBeenCalled();
    expect(h.duplicates).not.toHaveBeenCalled();
    h.config.issues.enabled = true;
    h.config.issues.triage.enabled = false;
    await h.send('issues', h.issue());
    expect(h.triage).not.toHaveBeenCalled();
    expect(h.duplicates).toHaveBeenCalledOnce();
  });
  it('clears stale duplicate suggestions', async () => {
    const h = setup();
    await h.send('issues', h.issue());
    h.state.candidates = [];
    await h.send('issues', { ...h.issue(), action: 'reopened' });
    expect(h.state.comments.find((c) => c.body.includes('Duplicate Check'))?.body).toContain(
      'No high-confidence',
    );
  });
});

it.each(['triage', 'duplicates'])('routes authorized issue command %s', async (command) => {
  const h = setup();
  await h.send('issue_comment', { ...h.comment(`/om ${command}`), issue: { number: 1 } });
  expect(command === 'triage' ? h.triage : h.duplicates).toHaveBeenCalledOnce();
  expect(h.state.comments).toHaveLength(1);
});
it('permission API failure cannot reach provider, even for OWNER association', async () => {
  const h = setup();
  h.state.fail = true;
  expect((await h.send('issue_comment', h.comment())).statusCode).toBe(200);
  expect(h.review).not.toHaveBeenCalled();
});
it.each(['getPullRequest', 'getIssue', 'listIssueCandidates', 'upsertComment'])(
  'reports GitHub %s failure without leaking transport details',
  async (operation) => {
    const h = setup();
    h.state.fail = true;
    if (operation === 'getPullRequest')
      await expect(h.adapter.getPullRequest('a/b', 1)).rejects.toThrow(
        'Unable to load pull request',
      );
    if (operation === 'getIssue')
      await expect(h.adapter.getIssue('a/b', 1)).rejects.toThrow('Unable to load issue');
    if (operation === 'listIssueCandidates')
      await expect(h.adapter.listIssueCandidates('a/b', 'test', 5)).rejects.toThrow(
        'Unable to search',
      );
    if (operation === 'upsertComment')
      await expect(h.adapter.upsertComment('a/b', 1, marker('pr-review'), 'text')).rejects.toThrow(
        'Unable to update comment',
      );
  },
);
it('normalizes search text so repository content cannot inject search qualifiers', async () => {
  const h = setup();
  await h.adapter.listIssueCandidates('a/b', 'repo:evil/other is:pr', 5);
  // This fixture only handles /search/issues; the transport boundary never follows issue URLs.
  expect(h.state.calls[0]?.path).toBe('/search/issues');
  await expect(h.adapter.getIssue('a/b/extra', 1)).rejects.toThrow('owner/name');
});
it('caps rendered comment size below GitHub API limits', async () => {
  const h = setup();
  await h.adapter.upsertComment('a/b', 1, marker('command'), 'x'.repeat(100_000));
  expect(h.state.comments[0]?.body.length).toBeLessThanOrEqual(60_000);
  expect(h.state.comments[0]?.body).toContain('[truncated by OpenMaintainer]');
  expect(h.state.comments[0]?.body.startsWith(`${marker('command')}\n`)).toBe(true);
});
