import type { AIProvider } from '@openmaintainer/ai';
import type { OpenMaintainerConfig } from '@openmaintainer/config';
import type { GitHubAdapter } from '@openmaintainer/github';

export interface AppOptions {
  config: OpenMaintainerConfig;
  provider: AIProvider;
  webhookSecret: string;
  appId?: number;
  privateKey?: string;
  /** Explicit adapter factory keeps integration tests offline. */
  adapterFactory?: (installationId: number) => GitHubAdapter;
}
