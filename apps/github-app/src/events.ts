import { z } from 'zod';
import {
  canRunCommand,
  commandHelp,
  parseCommand,
  DuplicateService,
  IssueTriageService,
  ReviewService,
  renderDuplicateComment,
  renderReviewComment,
  renderTriageComment,
} from '@openmaintainer/core';
import { marker } from '@openmaintainer/shared';
import type { GitHubAdapter } from '@openmaintainer/github';
import type { AppOptions } from './options.js';
import { getAdapter } from './adapters.js';

const user = z.object({ type: z.string(), login: z.string().optional() });
const number = z.number().int().positive();
export const EventSchema = z.object({
  action: z.string().optional(),
  installation: z.object({ id: number }).optional(),
  repository: z
    .object({ full_name: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/) })
    .optional(),
  number: number.optional(),
  pull_request: z.object({ number, draft: z.boolean().optional() }).optional(),
  issue: z.object({ number, pull_request: z.object({}).optional() }).optional(),
  comment: z
    .object({ body: z.string().max(100_000), user, author_association: z.string().optional() })
    .optional(),
  sender: user.optional(),
});
export type EventPayload = z.infer<typeof EventSchema>;
type Context = { repo: string; number: number; adapter: GitHubAdapter; options: AppOptions };

async function review({ repo, number, adapter, options }: Context, manual = false) {
  if (!options.config.review.enabled) return;
  const pr = await adapter.getPullRequest(repo, number);
  if (pr.draft && !options.config.review.drafts && !manual) return;
  const result = await new ReviewService(options.provider, options.config).review({
    repository: repo,
    number,
    ...pr,
  });
  await adapter.upsertComment(repo, number, marker('pr-review'), renderReviewComment(result));
}
async function duplicates(context: Context, issue: { title: string; body: string }) {
  const { repo, number, adapter, options } = context;
  if (!options.config.issues.enabled || !options.config.issues.duplicates.enabled) return;
  const candidates = await adapter.listIssueCandidates(
    repo,
    issue.title,
    options.config.issues.duplicates.maxCandidates,
  );
  const results = await new DuplicateService(options.provider, options.config).find(
    { repository: repo, number, ...issue },
    candidates,
  );
  // Update even when empty so a former duplicate suggestion cannot remain stale.
  await adapter.upsertComment(
    repo,
    number,
    marker('duplicates'),
    renderDuplicateComment(results, candidates),
  );
}
async function triage(context: Context, includeDuplicates: boolean) {
  const { repo, number, adapter, options } = context;
  if (!options.config.issues.enabled) return;
  const issue = await adapter.getIssue(repo, number);
  if (options.config.issues.triage.enabled) {
    const result = await new IssueTriageService(options.provider, options.config).triage({
      repository: repo,
      number,
      ...issue,
    });
    await adapter.upsertComment(repo, number, marker('issue-triage'), renderTriageComment(result));
    if (result.isSecuritySensitive) return;
  }
  if (includeDuplicates) await duplicates(context, issue);
}
async function comment(context: Context, payload: EventPayload) {
  const { options, repo, number, adapter } = context;
  const command = parseCommand(payload.comment?.body ?? '', options.config.commands.prefix);
  const login = payload.comment?.user.login;
  if (!command || !login || !options.config.commands.enabled) return;
  // author_association does not imply repository write permission.
  const role = await adapter.getPermission(repo, login);
  if (!canRunCommand(role, options.config)) return;
  if (command === 'help' || command === 'release-notes') {
    const body =
      command === 'help'
        ? commandHelp(options.config.commands.prefix)
        : 'Release notes are generated locally: openmaintainer release-notes --from <ref> --to <ref> --fixture <merged-pr-json> --dry-run. Supply verified merged PR metadata; refs label the output, not a GitHub comparison. Nothing is published.';
    await adapter.upsertComment(repo, number, marker('command'), `${marker('command')}\n${body}`);
  } else if (command === 'review' || command === 'summarize') {
    if (payload.issue?.pull_request) await review(context, true);
  } else if (!payload.issue?.pull_request && options.config.issues.enabled) {
    if (command === 'triage') await triage(context, false);
    else if (options.config.issues.duplicates.enabled)
      await duplicates(context, await adapter.getIssue(repo, number));
  }
}
export async function processEvent(
  event: string,
  payload: EventPayload,
  options: AppOptions,
): Promise<void> {
  const repo = payload.repository?.full_name;
  const installationId = payload.installation?.id;
  const number = payload.number ?? payload.pull_request?.number ?? payload.issue?.number;
  if (!repo || !installationId || !number) return;
  if (payload.sender?.type === 'Bot' || payload.comment?.user.type === 'Bot') return;
  const isPR =
    event === 'pull_request' &&
    ['opened', 'reopened', 'synchronize', 'ready_for_review'].includes(payload.action ?? '') &&
    options.config.review.enabled;
  const isIssue =
    event === 'issues' &&
    ['opened', 'reopened'].includes(payload.action ?? '') &&
    options.config.issues.enabled &&
    (options.config.issues.triage.enabled || options.config.issues.duplicates.enabled);
  const isCommand =
    event === 'issue_comment' &&
    payload.action === 'created' &&
    options.config.commands.enabled &&
    parseCommand(payload.comment?.body ?? '', options.config.commands.prefix);
  if (!isPR && !isIssue && !isCommand) return;
  if (isPR && payload.pull_request?.draft && !options.config.review.drafts) return;
  const context = { repo, number, options, adapter: getAdapter(options, installationId) };
  if (isPR) await review(context);
  else if (isIssue) await triage(context, true);
  else await comment(context, payload);
}
