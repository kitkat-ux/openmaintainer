import { access, readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { MockAIProvider } from '@openmaintainer/ai';
import { defaultConfigYaml, loadConfig, parseConfig } from '@openmaintainer/config';
import {
  DuplicateService,
  IssueTriageService,
  ReleaseNotesService,
  ReviewService,
  renderDuplicateComment,
  renderReviewComment,
  renderTriageComment,
} from '@openmaintainer/core';
import {
  ConfigurationError,
  type PullRequestReviewInput,
  type IssueTriageInput,
} from '@openmaintainer/shared';
import { parse } from 'yaml';

const program = new Command()
  .name('openmaintainer')
  .description('An open-source AI maintainer for GitHub repositories')
  .version('0.1.0');
program
  .command('version')
  .description('Print the OpenMaintainer version')
  .action(() => console.log('0.1.0'));
program
  .command('init')
  .option('--yes', 'write defaults without prompting')
  .action(async () => {
    try {
      await access('.openmaintainer.yml');
      console.error(
        'Refusing to overwrite existing .openmaintainer.yml. Remove it or edit it directly.',
      );
      process.exitCode = 1;
      return;
    } catch {
      /* The file does not exist, so initialization may proceed. */
    }
    await writeFile('.openmaintainer.yml', defaultConfigYaml, 'utf8');
    console.log('Created .openmaintainer.yml with conservative defaults.');
  });
program
  .command('validate')
  .option('-c, --config <path>', 'configuration path', '.openmaintainer.yml')
  .action(async (options: { config: string }) => {
    try {
      const config = await loadConfig(options.config);
      console.log(`PASS configuration (${config.version})`);
    } catch (error) {
      console.error(`FAIL ${error instanceof Error ? error.message : 'configuration is invalid'}`);
      process.exitCode = 1;
    }
  });
function fixturePath(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}
program
  .command('review')
  .option('--fixture <path>')
  .action(async (options: { fixture?: string }) => {
    const fixture = JSON.parse(
      await readFile(fixturePath(options.fixture, 'fixtures/pull-requests/example.json'), 'utf8'),
    ) as PullRequestReviewInput;
    const result = await new ReviewService(new MockAIProvider(), await loadConfig()).review(
      fixture,
    );
    console.log(renderReviewComment(result));
  });
program
  .command('triage')
  .option('--fixture <path>')
  .action(async (options: { fixture?: string }) => {
    const fixture = JSON.parse(
      await readFile(fixturePath(options.fixture, 'fixtures/issues/example.json'), 'utf8'),
    ) as IssueTriageInput;
    const result = await new IssueTriageService(new MockAIProvider(), await loadConfig()).triage(
      fixture,
    );
    console.log(renderTriageComment(result));
  });
program
  .command('release-notes')
  .requiredOption('--from <ref>')
  .requiredOption('--to <ref>')
  .option('--dry-run', 'print only; never publish')
  .action(async (options: { from: string; to: string; dryRun?: boolean }) => {
    const changes = JSON.parse(await readFile('fixtures/pull-requests/merged.json', 'utf8')) as {
      number: number;
      title: string;
      body: string;
      labels: string[];
      url?: string;
    }[];
    const result = await new ReleaseNotesService(new MockAIProvider(), await loadConfig()).generate(
      { from: options.from, to: options.to, pullRequests: changes },
    );
    console.log(result.markdown);
    if (!options.dryRun)
      console.error('\nNo release was published: OpenMaintainer only generates Markdown in v0.1.');
  });
program.command('doctor').action(async () => {
  const major = Number(process.versions.node.split('.')[0]);
  console.log(`${major >= 20 ? 'PASS' : 'FAIL'} Node.js ${process.versions.node} (requires >=20)`);
  const provider = process.env.OPENMAINTAINER_API_KEY && process.env.OPENMAINTAINER_MODEL;
  console.log(`${provider ? 'PASS' : 'WARN'} AI provider environment (keys are never printed)`);
  try {
    await loadConfig();
    console.log('PASS configuration');
  } catch (error) {
    console.log(`FAIL configuration: ${error instanceof Error ? error.message : 'invalid'}`);
    process.exitCode = 1;
  }
  console.log(`${process.env.GITHUB_WEBHOOK_SECRET ? 'PASS' : 'WARN'} GitHub webhook secret`);
});
program.command('demo').action(async () => {
  const config = parseConfig(
    parse(await readFile('.openmaintainer.yml', 'utf8').catch(() => defaultConfigYaml)),
  );
  const provider = new MockAIProvider();
  const pr = JSON.parse(
    await readFile('fixtures/pull-requests/example.json', 'utf8'),
  ) as PullRequestReviewInput;
  const issue = JSON.parse(
    await readFile('fixtures/issues/example.json', 'utf8'),
  ) as IssueTriageInput;
  console.log('=== OpenMaintainer local demo ===\n');
  console.log(renderReviewComment(await new ReviewService(provider, config).review(pr)));
  console.log('\n--- Issue triage ---\n');
  console.log(renderTriageComment(await new IssueTriageService(provider, config).triage(issue)));
  const candidates = [
    {
      number: 12,
      title: 'Search fails for apostrophes',
      body: "When I search for O'Reilly, the request returns an error. Steps to reproduce: enter the name. Expected: a result; actual: a 500 response.",
      url: 'https://github.com/example/project/issues/12',
    },
  ];
  console.log('\n--- Duplicate detection ---\n');
  console.log(
    renderDuplicateComment(
      await new DuplicateService(provider, config).find(issue, candidates),
      candidates,
    ),
  );
  console.log('\n--- Release notes ---\n');
  console.log(
    (
      await new ReleaseNotesService(provider, config).generate({
        from: 'v0.1.0',
        to: 'HEAD',
        pullRequests: [
          {
            number: 42,
            title: 'Improve issue handling',
            body: 'Adds validation.',
            labels: ['enhancement'],
            url: 'https://github.com/example/project/pull/42',
          },
        ],
      })
    ).markdown,
  );
});
try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof ConfigurationError) console.error(`FAIL ${error.message}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
