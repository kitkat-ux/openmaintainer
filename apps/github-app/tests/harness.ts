import { Octokit } from '@octokit/rest';
import { OctokitGitHubAdapter } from '@openmaintainer/github';
import { MockAIProvider } from '@openmaintainer/ai';
import { defaultConfig } from '@openmaintainer/config';
import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import { buildServer } from '../src/server.js';

export function harness() {
  const config = structuredClone(defaultConfig);
  const provider = new MockAIProvider();
  const review = vi.spyOn(provider, 'reviewPullRequest');
  const triage = vi.spyOn(provider, 'triageIssue');
  const duplicates = vi.spyOn(provider, 'compareDuplicateIssues');
  const state = {
    role: 'write',
    draft: false,
    fail: false,
    files: [
      {
        filename: 'src/auth.ts',
        patch: '+ db.query(req.input)',
        additions: 1,
        deletions: 0,
        changes: 1,
      },
    ],
    comments: [] as Array<{
      id: number;
      body: string;
      user: { type: string };
      performed_via_github_app: { id: number };
    }>,
    issue: { title: 'Search fails', body: 'Search query fails on apostrophes.' },
    candidates: [
      {
        number: 7,
        title: 'Search fails',
        body: 'Search query fails on apostrophes.',
        html_url: 'https://github.com/a/b/issues/7',
      },
    ],
    calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    state.calls.push({ method, path, body });
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (state.fail) return response({ message: 'test failure' }, 500);
    if (path.endsWith('/permission'))
      return response({ permission: state.role, role_name: state.role });
    if (path.endsWith('/pulls/1/files')) return response(state.files);
    if (path.endsWith('/pulls/1'))
      return response({
        title: 'Fix search',
        body: 'Change query',
        draft: state.draft,
        base: { ref: 'main' },
        head: { ref: 'fix' },
      });
    if (path.endsWith('/issues/1/comments')) {
      if (method === 'GET') return response(state.comments);
      const comment = {
        id: state.comments.length + 1,
        body: String(body.body),
        user: { type: 'Bot' },
        performed_via_github_app: { id: 123 },
      };
      state.comments.push(comment);
      return response(comment, 201);
    }
    if (/\/issues\/comments\/\d+$/.test(path)) {
      const comment = state.comments.find((c) => c.id === Number(path.split('/').at(-1)))!;
      comment.body = String(body.body);
      return response(comment);
    }
    if (path.endsWith('/issues/1')) return response(state.issue);
    if (path === '/search/issues')
      return response({
        total_count: state.candidates.length,
        incomplete_results: false,
        items: state.candidates,
      });
    throw new Error(`Unexpected offline GitHub request: ${method} ${path}`);
  };
  const adapter = new OctokitGitHubAdapter(
    new Octokit({
      auth: 'fixture-token-not-real',
      request: { fetch: fetchImpl },
      log: { debug() {}, info() {}, warn() {}, error() {} },
    }),
    123,
  );
  const adapterFactory = vi.fn(() => adapter);
  const app = buildServer({ config, provider, webhookSecret: 'fixture-secret', adapterFactory });
  const base = {
    action: 'opened',
    installation: { id: 22 },
    repository: { full_name: 'a/b' },
    number: 1,
    sender: { type: 'User', login: 'maintainer' },
  };
  const pr = (action = 'opened') => ({
    ...base,
    action,
    pull_request: { number: 1, draft: false },
  });
  const issue = () => ({ ...base, issue: { number: 1 } });
  const comment = (body = '/om review') => ({
    ...base,
    action: 'created',
    issue: { number: 1, pull_request: {} },
    comment: { body, user: { type: 'User', login: 'maintainer' }, author_association: 'OWNER' },
  });
  const send = (event: string, payload: unknown, delivery?: string, signature?: string) => {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return app.inject({
      method: 'POST',
      url: '/webhooks/github',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-github-event': event,
        'x-hub-signature-256':
          signature ??
          `sha256=${createHmac('sha256', 'fixture-secret').update(body).digest('hex')}`,
        ...(delivery ? { 'x-github-delivery': delivery } : {}),
      },
    });
  };
  return {
    app,
    config,
    provider,
    review,
    triage,
    duplicates,
    state,
    adapter,
    adapterFactory,
    pr,
    issue,
    comment,
    send,
  };
}
