import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { OctokitGitHubAdapter, type GitHubAdapter } from '@openmaintainer/github';
import type { AppOptions } from './options.js';

export function getAdapter(options: AppOptions, installationId: number): GitHubAdapter {
  if (options.adapterFactory) return options.adapterFactory(installationId);
  if (!options.appId || !options.privateKey)
    throw new Error('GitHub App credentials are not configured.');
  return new OctokitGitHubAdapter(
    new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: options.appId, privateKey: options.privateKey, installationId },
      request: { timeout: 15_000 },
    }),
    options.appId,
  );
}
