import Fastify, { type FastifyInstance } from 'fastify';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { MockAIProvider, OpenAICompatibleProvider, type AIProvider } from '@openmaintainer/ai';
import { loadConfig, type OpenMaintainerConfig } from '@openmaintainer/config';
import {
  canRunCommand,
  commandHelp,
  DuplicateService,
  IssueTriageService,
  renderDuplicateComment,
  renderReviewComment,
  renderTriageComment,
  ReviewService,
} from '@openmaintainer/core';
import { OctokitGitHubAdapter } from '@openmaintainer/github';
import { logger } from '@openmaintainer/logger';
import { verifyGithubSignature, marker } from '@openmaintainer/shared';

interface AppOptions {
  config: OpenMaintainerConfig;
  provider: AIProvider;
  webhookSecret: string;
  appId?: number;
  privateKey?: string;
}
interface EventPayload {
  action?: string;
  installation?: { id?: number };
  repository?: { full_name?: string };
  number?: number;
  pull_request?: { number: number; draft?: boolean };
  issue?: { number: number; pull_request?: unknown };
  comment?: { body?: string; user?: { type?: string }; author_association?: string };
  sender?: { type?: string };
}
function jsonBody(body: unknown): EventPayload {
  if (!Buffer.isBuffer(body)) throw new Error('Webhook parser did not provide raw body.');
  return JSON.parse(body.toString('utf8')) as EventPayload;
}
function getAdapter(options: AppOptions, installationId: number): OctokitGitHubAdapter {
  if (!options.appId || !options.privateKey)
    throw new Error('GitHub App credentials are not configured.');
  return new OctokitGitHubAdapter(
    new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: options.appId, privateKey: options.privateKey, installationId },
    }),
  );
}
function repository(payload: EventPayload): string | undefined {
  return payload.repository?.full_name;
}
async function processEvent(
  event: string,
  payload: EventPayload,
  options: AppOptions,
): Promise<void> {
  const repo = repository(payload);
  const installationId = payload.installation?.id;
  if (!repo || !installationId) return;
  if (payload.sender?.type === 'Bot' || payload.comment?.user?.type === 'Bot') return;
  const adapter = getAdapter(options, installationId);
  const number = payload.number ?? payload.pull_request?.number ?? payload.issue?.number;
  if (!number) return;
  if (
    event === 'pull_request' &&
    ['opened', 'reopened', 'synchronize', 'ready_for_review'].includes(payload.action ?? '') &&
    options.config.review.enabled
  ) {
    const pr = await adapter.getPullRequest(repo, number);
    if (pr && (!payload.pull_request?.draft || options.config.review.drafts))
      await adapter.upsertComment(
        repo,
        number,
        marker('pr-review'),
        renderReviewComment(
          await new ReviewService(options.provider, options.config).review({
            repository: repo,
            number,
            ...pr,
          }),
        ),
      );
    return;
  }
  if (
    event === 'issues' &&
    ['opened', 'reopened'].includes(payload.action ?? '') &&
    options.config.issues.triage.enabled
  ) {
    const issue = await adapter.getIssue(repo, number);
    const result = await new IssueTriageService(options.provider, options.config).triage({
      repository: repo,
      number,
      ...issue,
    });
    await adapter.upsertComment(repo, number, marker('issue-triage'), renderTriageComment(result));
    if (options.config.issues.duplicates.enabled) {
      const candidates = await adapter.listIssueCandidates(
        repo,
        issue.title,
        options.config.issues.duplicates.maxCandidates,
      );
      const duplicateResults = await new DuplicateService(options.provider, options.config).find(
        { repository: repo, number, ...issue },
        candidates,
      );
      if (duplicateResults.length)
        await adapter.upsertComment(
          repo,
          number,
          marker('duplicates'),
          renderDuplicateComment(duplicateResults, candidates),
        );
    }
    return;
  }
  if (event === 'issue_comment' && payload.action === 'created' && payload.comment?.body) {
    const command = payload.comment.body.trim().split(/\s+/)[1];
    const role = ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(
      payload.comment.author_association ?? '',
    )
      ? 'write'
      : undefined;
    if (!canRunCommand(role, options.config)) return;
    if (command === 'help') {
      await adapter.upsertComment(
        repo,
        number,
        marker('command'),
        commandHelp(options.config.commands.prefix),
      );
      return;
    }
    if (command === 'review' || command === 'summarize') {
      const pr = await adapter.getPullRequest(repo, number);
      const result = await new ReviewService(options.provider, options.config).review({
        repository: repo,
        number,
        ...pr,
      });
      await adapter.upsertComment(repo, number, marker('pr-review'), renderReviewComment(result));
      return;
    }
    const issue = await adapter.getIssue(repo, number);
    if (command === 'triage') {
      const result = await new IssueTriageService(options.provider, options.config).triage({
        repository: repo,
        number,
        ...issue,
      });
      await adapter.upsertComment(
        repo,
        number,
        marker('issue-triage'),
        renderTriageComment(result),
      );
    }
    if (command === 'duplicates') {
      const candidates = await adapter.listIssueCandidates(
        repo,
        issue.title,
        options.config.issues.duplicates.maxCandidates,
      );
      const results = await new DuplicateService(options.provider, options.config).find(
        { repository: repo, number, ...issue },
        candidates,
      );
      if (results.length)
        await adapter.upsertComment(
          repo,
          number,
          marker('duplicates'),
          renderDuplicateComment(results, candidates),
        );
    }
  }
}
export function buildServer(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 1_500_000 });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
  const started = Date.now();
  app.get('/health', async (_request, reply) =>
    reply
      .code(200)
      .send({ status: 'ok', version: '0.1.0', uptime: Math.floor((Date.now() - started) / 1000) }),
  );
  app.post('/webhooks/github', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'];
    const event = request.headers['x-github-event'];
    const delivery = request.headers['x-github-delivery'];
    const raw = request.body;
    if (
      !Buffer.isBuffer(raw) ||
      typeof signature !== 'string' ||
      !verifyGithubSignature(raw, signature, options.webhookSecret)
    ) {
      logger.warn({ event, delivery }, 'github.webhook.rejected');
      return reply.code(401).send({ error: 'Invalid webhook signature.' });
    }
    let payload: EventPayload;
    try {
      payload = jsonBody(raw);
    } catch {
      return reply.code(400).send({ error: 'Invalid webhook JSON.' });
    }
    logger.info({ event, delivery, repository: repository(payload) }, 'github.webhook.received');
    try {
      if (typeof event === 'string') await processEvent(event, payload, options);
    } catch (error) {
      logger.error({ event, delivery, err: error }, 'github.webhook.failed');
      return reply.code(202).send({ accepted: true });
    }
    return reply.code(200).send({ accepted: true });
  });
  return app;
}
async function main(): Promise<void> {
  const config = await loadConfig();
  const apiKey = process.env.OPENMAINTAINER_API_KEY;
  const model = process.env.OPENMAINTAINER_MODEL;
  const provider: AIProvider =
    apiKey && model
      ? new OpenAICompatibleProvider({
          apiKey,
          model,
          ...(process.env.OPENMAINTAINER_BASE_URL
            ? { baseUrl: process.env.OPENMAINTAINER_BASE_URL }
            : {}),
        })
      : new MockAIProvider();
  const appOptions: AppOptions = {
    config,
    provider,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
    ...(process.env.GITHUB_APP_ID ? { appId: Number(process.env.GITHUB_APP_ID) } : {}),
    ...(process.env.GITHUB_PRIVATE_KEY
      ? { privateKey: process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n') }
      : {}),
  };
  const app = buildServer(appOptions);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'openmaintainer.started');
}
if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    logger.fatal({ err: error }, 'openmaintainer.start_failed');
    process.exitCode = 1;
  });
