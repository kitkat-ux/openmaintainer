import { afterEach, expect, it } from 'vitest';
import { harness } from './harness.js';
import { loadEnvironment, providerFromEnvironment } from '../src/environment.js';
const servers: ReturnType<typeof harness>[] = [];
function setup() {
  const h = harness();
  servers.push(h);
  return h;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((h) => h.app.close()));
});
it.each([
  'sha256=bad',
  `sha1=${'a'.repeat(64)}`,
  `sha256=${'g'.repeat(64)}`,
  `sha256=${'a'.repeat(64)}`,
  '',
])('rejects signature %s before parsing', async (sig) => {
  const h = setup();
  expect((await h.send('issues', '{bad json', undefined, sig)).statusCode).toBe(401);
  expect(h.adapterFactory).not.toHaveBeenCalled();
});
it('rejects missing signatures', async () => {
  const h = setup();
  expect(
    (
      await h.app.inject({
        method: 'POST',
        url: '/webhooks/github',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      })
    ).statusCode,
  ).toBe(401);
});
it.each([
  '{',
  'null',
  '[]',
  '{"repository":null}',
  '{"installation":{"id":-1}}',
  '{"issue":{"number":"1"}}',
])('rejects signed invalid payload: %s', async (body) => {
  const h = setup();
  expect((await h.send('issues', body)).statusCode).toBe(400);
  expect(h.adapterFactory).not.toHaveBeenCalled();
});
it('bounds payload before any provider or adapter work', async () => {
  const h = setup();
  expect((await h.send('issues', 'x'.repeat(1_500_001))).statusCode).toBe(413);
  expect(h.adapterFactory).not.toHaveBeenCalled();
});
it('health exposes only status, version, uptime', async () => {
  const h = setup();
  const response = await h.app.inject('/health');
  expect(response.json()).toEqual({ status: 'ok', version: '0.1.0', uptime: expect.any(Number) });
  expect(response.body).not.toContain('fixture-secret');
});
it('requires explicit mock selection; never silently falls back when credentials missing', () => {
  expect(() => providerFromEnvironment({})).toThrow('OPENMAINTAINER_API_KEY');
  expect(() => providerFromEnvironment({ OPENMAINTAINER_API_KEY: 'fixture-only' })).toThrow(
    'OPENMAINTAINER_MODEL',
  );
  expect(providerFromEnvironment({ OPENMAINTAINER_PROVIDER: 'mock' }).constructor.name).toBe(
    'MockAIProvider',
  );
  expect(() => providerFromEnvironment({ OPENMAINTAINER_PROVIDER: 'typo' })).toThrow('Unknown');
});
it('validates startup environment without exposing supplied secrets', async () => {
  await expect(loadEnvironment({ PORT: 'bad' })).rejects.toThrow('PORT');
  await expect(loadEnvironment({})).rejects.toThrow('GITHUB_APP_ID');
  const loaded = await loadEnvironment({
    OPENMAINTAINER_PROVIDER: 'mock',
    GITHUB_APP_ID: '123',
    GITHUB_PRIVATE_KEY: 'fixture\\nkey',
    GITHUB_WEBHOOK_SECRET: 'fixture-secret',
  });
  expect(loaded.options.privateKey).toBe('fixture\nkey');
  expect(loaded.port).toBe(3000);
});

it('expires delivery cache after ten minutes', async () => {
  const h = setup();
  const realNow = Date.now;
  try {
    Date.now = () => 1_000_000;
    await h.send('pull_request', h.pr(), 'expires');
    await h.send('pull_request', h.pr(), 'expires');
    expect(h.review).toHaveBeenCalledOnce();
    Date.now = () => 1_600_001;
    await h.send('pull_request', h.pr(), 'expires');
    expect(h.review).toHaveBeenCalledTimes(2);
  } finally {
    Date.now = realNow;
  }
});
it('rejects excess pending work instead of unbounded queue growth', async () => {
  const h = setup();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.review.mockImplementation(async () => {
    await blocked;
    return { summary: 'x', testing: '', findings: [] };
  });
  // An inject promise starts processing only when awaited/then is attached.
  const pending = Array.from({ length: 20 }, (_, i) =>
    h.send('pull_request', h.pr(), `capacity-${i}`).then((r) => r),
  );
  // Allow one event-loop turn for Fastify to admit the bounded requests.
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    expect((await h.send('pull_request', h.pr(), 'capacity-overflow')).statusCode).toBe(503);
  } finally {
    release();
    await Promise.all(pending);
  }
  expect(h.review).toHaveBeenCalledTimes(20);
});
it('rate-limits requests before authorization, without trusting forwarded IP headers', async () => {
  const h = setup();
  for (let i = 0; i < 120; i++) {
    const response = await h.app.inject({
      method: 'POST',
      url: '/webhooks/github',
      payload: '{}',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i}` },
    });
    expect(response.statusCode).toBe(401);
  }
  expect((await h.send('pull_request', h.pr())).statusCode).toBe(429);
  expect(h.review).not.toHaveBeenCalled();
  expect((await h.app.inject('/health')).statusCode).toBe(200);
});
