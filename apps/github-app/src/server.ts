import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { verifyGithubSignature } from '@openmaintainer/shared';
import { logger } from '@openmaintainer/logger';
import { EventSchema, processEvent } from './events.js';
import type { AppOptions } from './options.js';

export function buildServer(options: AppOptions): FastifyInstance {
  if (!options.webhookSecret) throw new Error('GITHUB_WEBHOOK_SECRET is required.');
  const app = Fastify({ logger: false, bodyLimit: 1_500_000 });
  // Limit unauthenticated traffic too; do not trust caller-supplied forwarding headers.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
  const started = Date.now();
  const completed = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();
  const targets = new Map<string, Promise<void>>();
  let pending = 0;
  void app.register(async (routes) => {
    await routes.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    routes.get('/health', { config: { rateLimit: false } }, async () => ({
      status: 'ok',
      version: '0.1.0',
      uptime: Math.floor((Date.now() - started) / 1000),
    }));
    routes.post('/webhooks/github', async (request, reply) => {
      const signature = request.headers['x-hub-signature-256'];
      const event = request.headers['x-github-event'];
      const delivery = request.headers['x-github-delivery'];
      const raw = request.body;
      if (
        !Buffer.isBuffer(raw) ||
        typeof signature !== 'string' ||
        !verifyGithubSignature(raw, signature, options.webhookSecret)
      )
        return reply.code(401).send({ error: 'Invalid webhook signature.' });
      // Parsing and routing occur only after authenticating the exact raw bytes.
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply.code(400).send({ error: 'Invalid webhook JSON.' });
      }
      const checked = EventSchema.safeParse(decoded);
      if (!checked.success) return reply.code(400).send({ error: 'Invalid webhook payload.' });
      if (typeof event !== 'string')
        return reply.code(400).send({ error: 'Missing GitHub event.' });
      if (!['pull_request', 'issues', 'issue_comment'].includes(event)) return { accepted: true };
      // Bounded, process-local replay protection; failed work may be redelivered.
      const now = Date.now();
      for (const [id, time] of completed) if (now - time > 600_000) completed.delete(id);
      const id = typeof delivery === 'string' && delivery.length <= 200 ? delivery : undefined;
      if (id && completed.has(id)) return { accepted: true, duplicate: true };
      if (pending >= 20)
        return reply.code(503).send({ error: 'Webhook capacity exceeded; redeliver later.' });
      const payload = checked.data;
      const target = `${payload.installation?.id}:${payload.repository?.full_name}:${payload.number ?? payload.pull_request?.number ?? payload.issue?.number}`;
      try {
        const existing = id ? inFlight.get(id) : undefined;
        if (existing) {
          await existing;
          return { accepted: true, duplicate: true };
        }
        pending += 1;
        const previous = targets.get(target) ?? Promise.resolve();
        const work = previous.catch(() => {}).then(() => processEvent(event, payload, options));
        targets.set(target, work);
        if (id) inFlight.set(id, work);
        try {
          await work;
          if (id) {
            if (completed.size >= 1000) completed.delete(completed.keys().next().value!);
            completed.set(id, Date.now());
          }
        } finally {
          pending -= 1;
          if (id) inFlight.delete(id);
          if (targets.get(target) === work) targets.delete(target);
        }
      } catch {
        // Never serialize provider/Octokit exceptions: they may contain bodies or credentials.
        logger.error({ event }, 'github.webhook.failed');
        return reply.code(503).send({ error: 'Webhook processing failed; redeliver later.' });
      }
      return { accepted: true };
    });
  });
  app.setErrorHandler((error, _request, reply) => {
    const code =
      error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof code === 'number' && code >= 400 && code < 500 ? code : 500;
    void reply
      .code(status)
      .send({ error: status === 413 ? 'Webhook payload too large.' : 'Request failed.' });
  });
  return app;
}
