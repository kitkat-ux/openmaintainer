import { Octokit } from '@octokit/rest';
import type { PullRequestFile } from '@openmaintainer/shared';
import { GitHubApiError, truncate } from '@openmaintainer/shared';
export interface GitHubAdapter {
  getPermission(repository: string, username: string): Promise<string | undefined>;
  getPullRequest(
    repository: string,
    number: number,
  ): Promise<{
    draft?: boolean;
    title: string;
    body: string;
    baseRef?: string;
    headRef?: string;
    files: PullRequestFile[];
  }>;
  getIssue(repository: string, number: number): Promise<{ title: string; body: string }>;
  listIssueCandidates(
    repository: string,
    query: string,
    limit: number,
  ): Promise<Array<{ number: number; title: string; body: string; url?: string }>>;
  upsertComment(
    repository: string,
    issueNumber: number,
    marker: string,
    body: string,
  ): Promise<void>;
}
function repoParts(repository: string): { owner: string; repo: string } {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository))
    throw new GitHubApiError('Repository must use owner/name format.');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new GitHubApiError('Repository must use owner/name format.');
  return { owner, repo };
}
export class OctokitGitHubAdapter implements GitHubAdapter {
  constructor(
    private readonly octokit: Octokit,
    private readonly appId?: number,
  ) {}
  async getPermission(repository: string, username: string): Promise<string | undefined> {
    const { owner, repo } = repoParts(repository);
    try {
      const result = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
      });
      return result.data.role_name ?? result.data.permission;
    } catch {
      // A denied or unavailable permission lookup must never grant access.
      return undefined;
    }
  }
  async getPullRequest(repository: string, number: number) {
    const { owner, repo } = repoParts(repository);
    try {
      const [pr, files] = await Promise.all([
        this.octokit.rest.pulls.get({ owner, repo, pull_number: number }),
        this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
          owner,
          repo,
          pull_number: number,
          per_page: 100,
        }),
      ]);
      return {
        draft: pr.data.draft ?? false,
        title: pr.data.title,
        body: pr.data.body ?? '',
        baseRef: pr.data.base.ref,
        headRef: pr.data.head.ref,
        files: files.map((file) => ({
          path: file.filename,
          ...(file.patch ? { patch: file.patch } : {}),
          additions: file.additions,
          deletions: file.deletions,
          binary: !file.patch && file.changes > 0,
        })),
      };
    } catch (error) {
      throw new GitHubApiError(`Unable to load pull request ${repository}#${number}.`, {
        cause: error,
      });
    }
  }
  async getIssue(repository: string, number: number) {
    const { owner, repo } = repoParts(repository);
    try {
      const issue = await this.octokit.rest.issues.get({ owner, repo, issue_number: number });
      return { title: issue.data.title, body: issue.data.body ?? '' };
    } catch (error) {
      throw new GitHubApiError(`Unable to load issue ${repository}#${number}.`, { cause: error });
    }
  }
  async listIssueCandidates(repository: string, query: string, limit: number) {
    const { owner, repo } = repoParts(repository);
    try {
      const result = await this.octokit.rest.search.issuesAndPullRequests({
        q: `${query.replace(/[^a-zA-Z0-9 ]/g, ' ').slice(0, 150)} repo:${owner}/${repo} is:issue`,
        per_page: Math.min(limit, 100),
      });
      return result.data.items.map((item) => ({
        number: item.number,
        title: item.title,
        body: item.body ?? '',
        url: item.html_url,
      }));
    } catch (error) {
      throw new GitHubApiError('Unable to search issue candidates.', { cause: error });
    }
  }
  async upsertComment(
    repository: string,
    issueNumber: number,
    commentMarker: string,
    body: string,
  ) {
    const { owner, repo } = repoParts(repository);
    try {
      const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
      });
      const ownAppId = this.appId ?? (await this.octokit.rest.apps.getAuthenticated()).data?.id;
      if (!ownAppId) throw new GitHubApiError('Unable to determine GitHub App identity.');
      if (!body.startsWith(`${commentMarker}\n`)) body = `${commentMarker}\n${body}`;
      body = truncate(body, 60_000); // Stay below GitHub's 65,536-character comment limit.
      const existing = comments.find(
        (comment) =>
          comment.user?.type === 'Bot' &&
          comment.performed_via_github_app?.id === ownAppId &&
          comment.body?.startsWith(`${commentMarker}\n`),
      );
      if (existing)
        await this.octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existing.id,
          body,
        });
      else
        await this.octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body,
        });
    } catch (error) {
      throw new GitHubApiError(`Unable to update comment on ${repository}#${issueNumber}.`, {
        cause: error,
      });
    }
  }
}
export function createOctokit(token?: string): Octokit {
  if (!token) throw new GitHubApiError('A GitHub installation token is required.');
  return new Octokit({ auth: token, request: { timeout: 15_000 } });
}
