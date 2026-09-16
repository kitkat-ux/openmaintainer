import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildServer } from '../src/index.js';
import { MockAIProvider } from '@openmaintainer/ai';
import { defaultConfig } from '@openmaintainer/config';
function signature(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}
describe('webhook server', () => {
  it('rejects invalid signatures and serves health', async () => {
    const app = buildServer({
      config: defaultConfig,
      provider: new MockAIProvider(),
      webhookSecret: 'secret',
    });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/webhooks/github',
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': 'sha256=bad',
            'x-github-event': 'ping',
          },
          payload: '{}',
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });
  it('accepts a signed event without processing missing repository context', async () => {
    const app = buildServer({
      config: defaultConfig,
      provider: new MockAIProvider(),
      webhookSecret: 'secret',
    });
    const body = JSON.stringify({ action: 'opened' });
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature(body, 'secret'),
        'x-github-event': 'issues',
      },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
