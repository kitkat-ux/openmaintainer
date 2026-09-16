import { MockAIProvider, OpenAICompatibleProvider, type AIProvider } from '@openmaintainer/ai';
import { loadConfig } from '@openmaintainer/config';
import type { AppOptions } from './options.js';

export function providerFromEnvironment(env: NodeJS.ProcessEnv = process.env): AIProvider {
  if (env.OPENMAINTAINER_PROVIDER === 'mock') return new MockAIProvider();
  if (env.OPENMAINTAINER_PROVIDER && env.OPENMAINTAINER_PROVIDER !== 'openai-compatible')
    throw new Error('Unknown OPENMAINTAINER_PROVIDER.');
  return new OpenAICompatibleProvider({
    apiKey: env.OPENMAINTAINER_API_KEY ?? '',
    model: env.OPENMAINTAINER_MODEL ?? '',
    ...(env.OPENMAINTAINER_BASE_URL ? { baseUrl: env.OPENMAINTAINER_BASE_URL } : {}),
  });
}
export async function loadEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ options: AppOptions; port: number }> {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be between 1 and 65535.');
  const appId = Number(env.GITHUB_APP_ID);
  if (
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    !env.GITHUB_PRIVATE_KEY ||
    !env.GITHUB_WEBHOOK_SECRET
  )
    throw new Error('GITHUB_APP_ID, GITHUB_PRIVATE_KEY and GITHUB_WEBHOOK_SECRET are required.');
  return {
    port,
    options: {
      config: await loadConfig(),
      provider: providerFromEnvironment(env),
      appId,
      privateKey: env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n'),
      webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    },
  };
}
