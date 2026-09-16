import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../src/index.js';
const root = process.cwd();
let cwd: string;
let logs: string[];
let errors: string[];
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'om-cli-'));
  process.chdir(cwd);
  process.exitCode = 0;
  logs = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));
  vi.stubEnv('OPENMAINTAINER_API_KEY', '');
  vi.stubEnv('OPENMAINTAINER_MODEL', '');
});
afterEach(async () => {
  process.chdir(root);
  process.exitCode = 0;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(cwd, { recursive: true, force: true });
});
const run = (...args: string[]) => runCli(['node', 'openmaintainer', ...args]);
it('init writes valid defaults and refuses overwrite', async () => {
  await run('init', '--yes');
  expect(process.exitCode).toBe(0);
  expect(await readFile('.openmaintainer.yml', 'utf8')).toContain('version: 1');
  await run('validate');
  expect(logs.join()).toContain('PASS');
  await run('init');
  expect(process.exitCode).toBe(1);
  expect(errors.join()).toContain('Refusing');
});
it('validate fails on missing file, unknown nested fields, and malformed YAML without leaking source', async () => {
  await run('validate');
  expect(process.exitCode).toBe(1);
  expect(errors.join()).toContain('not found');
  await writeFile('.openmaintainer.yml', 'version: 1\nreview:\n  misspelt: true');
  await run('validate');
  expect(errors.join()).toContain('Unrecognized');
  await writeFile('.openmaintainer.yml', 'secret: [fixture-secret-not-real');
  await run('validate');
  expect(errors.join()).not.toContain('fixture-secret-not-real');
  expect(process.exitCode).toBe(1);
});
it.each(['review', 'triage'])(
  '%s uses explicit fixtures and mock without credentials or config',
  async (command) => {
    const fixture = resolve(
      root,
      command === 'review' ? 'fixtures/pull-requests/example.json' : 'fixtures/issues/example.json',
    );
    await run(command, '--fixture', fixture, '--mock');
    expect(process.exitCode).toBe(0);
    expect(logs.join()).toContain('OpenMaintainer');
    expect(errors.join()).toContain('deterministic MockAIProvider');
  },
);
it.each(['review', 'triage'])(
  '%s requires provider credentials when not explicitly mocked',
  async (command) => {
    const fixture = resolve(
      root,
      command === 'review' ? 'fixtures/pull-requests/example.json' : 'fixtures/issues/example.json',
    );
    await run(command, '--fixture', fixture);
    expect(process.exitCode).toBe(1);
    expect(errors.join()).toContain('OPENMAINTAINER_API_KEY');
    expect(errors.join()).not.toContain(' at ');
  },
);
it('release-notes uses supplied metadata rather than invented comparison results', async () => {
  await run(
    'release-notes',
    '--from',
    'v0',
    '--to',
    'HEAD',
    '--fixture',
    resolve(root, 'fixtures/pull-requests/merged.json'),
    '--mock',
    '--dry-run',
  );
  expect(process.exitCode).toBe(0);
  expect(logs.join()).toContain('Improve user search (#42)');
});
it('doctor warns on absent credentials; invalid config sets failure exit code', async () => {
  await run('doctor');
  expect(process.exitCode).toBe(0);
  expect(logs.join()).toContain('WARN');
  await writeFile('.openmaintainer.yml', 'version: 99');
  await run('doctor');
  expect(process.exitCode).toBe(1);
});
it('version and --help succeed; missing arguments/unknown commands fail', async () => {
  await run('version');
  expect(logs).toContain('0.1.0');
  await run('--help');
  expect(process.exitCode).toBe(0);
  await run('review');
  expect(process.exitCode).toBe(1);
  await run('typo');
  expect(process.exitCode).toBe(1);
});
it('bad JSON, invalid fixture shape, and missing file fail without stacks', async () => {
  await writeFile('fixture.json', '{bad');
  await run('review', '--fixture', 'fixture.json', '--mock');
  expect(process.exitCode).toBe(1);
  expect(errors.join()).toContain('Invalid fixture JSON');
  await writeFile('fixture.json', 'null');
  await run('review', '--fixture', 'fixture.json', '--mock');
  expect(process.exitCode).toBe(1);
  await run('review', '--fixture', 'absent.json', '--mock');
  expect(process.exitCode).toBe(1);
  expect(errors.join()).not.toContain(' at ');
});
it('demo identifies all four workflows as deterministic fixtures', async () => {
  process.chdir(root);
  await run('demo');
  expect(process.exitCode).toBe(0);
  const text = logs.join('\n');
  for (const label of ['MockAIProvider', 'Review', 'Triage', 'Duplicate Check', 'Release notes'])
    expect(text).toContain(label);
});
