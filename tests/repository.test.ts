import { expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse } from 'yaml';
import { parseConfig, defaultConfigYaml } from '@openmaintainer/config';
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name.startsWith('.') || ['node_modules', 'dist', 'coverage'].includes(e.name)
      ? []
      : e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : [`${dir}/${e.name}`],
  );
}
it('validates every example config and generated default', () => {
  for (const folder of readdirSync('examples'))
    expect(() =>
      parseConfig(parse(readFileSync(`examples/${folder}/.openmaintainer.yml`, 'utf8'))),
    ).not.toThrow();
  expect(() => parseConfig(parse(defaultConfigYaml))).not.toThrow();
});
it('all documented config snippets validate', () => {
  for (const path of ['README.md', 'docs/configuration.md']) {
    for (const [, source] of readFileSync(path, 'utf8').matchAll(/```yaml\n([\s\S]*?)```/g))
      if (source?.includes('version: 1')) expect(() => parseConfig(parse(source))).not.toThrow();
  }
});
it('internal Markdown links resolve to tracked repository files', () => {
  for (const file of walk('.').filter((p) => p.endsWith('.md')))
    for (const [, link] of readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      if (!link || /^(https?:|mailto:|#)/.test(link)) continue;
      const path = decodeURIComponent(link.split('#')[0]!);
      expect(existsSync(resolve(dirname(file), path)), `${file} → ${link}`).toBe(true);
    }
});
it('core cannot import transport, GitHub, vendor SDKs, or server internals', () => {
  for (const path of walk('packages/core/src').filter((p) => p.endsWith('.ts'))) {
    const source = readFileSync(path, 'utf8');
    for (const [, name] of source.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)/g))
      expect(name).not.toMatch(/fastify|octokit|openai|github|apps\//i);
  }
  const manifest = JSON.parse(readFileSync('packages/core/package.json', 'utf8'));
  expect(Object.keys(manifest.dependencies).join(' ')).not.toMatch(
    /fastify|octokit|openai|github/i,
  );
});
it('nested typos and unsupported privacy switches fail instead of silently doing nothing', () => {
  expect(() => parseConfig({ version: 1, review: { maxFile: 1 } })).toThrow();
  expect(() => parseConfig({ version: 1, privacy: { telemetry: true } })).toThrow();
});
