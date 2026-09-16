import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { z } from 'zod';
import { ConfigurationError } from '@openmaintainer/shared';
import { parse, stringify } from 'yaml';

const FocusSchema = z.enum(['correctness', 'security', 'tests', 'performance', 'maintainability']);
const ReviewSchema = z.object({
  enabled: z.boolean().default(true),
  drafts: z.boolean().default(false),
  minimumConfidence: z.number().min(0).max(1).default(0.72),
  maxInlineComments: z.number().int().min(0).max(50).default(8),
  maxFiles: z.number().int().positive().max(500).default(50),
  maxDiffCharacters: z.number().int().positive().max(2_000_000).default(120_000),
  focus: z
    .array(FocusSchema)
    .default(['correctness', 'security', 'tests', 'performance', 'maintainability']),
  ignore: z
    .array(z.string().min(1))
    .default([
      '**/pnpm-lock.yaml',
      '**/package-lock.json',
      '**/yarn.lock',
      '**/*.min.js',
      'dist/**',
      'build/**',
      'coverage/**',
      'vendor/**',
    ]),
});
const IssuesSchema = z.object({
  enabled: z.boolean().default(true),
  triage: z.object({ enabled: z.boolean().default(true) }).default({}),
  duplicates: z
    .object({
      enabled: z.boolean().default(true),
      minimumConfidence: z.number().min(0).max(1).default(0.82),
      maxCandidates: z.number().int().positive().max(20).default(5),
    })
    .default({}),
});
const CommandsSchema = z.object({
  enabled: z.boolean().default(true),
  prefix: z
    .string()
    .regex(/^\/[a-z0-9-]+$/)
    .default('/om'),
  allowedRoles: z
    .array(z.enum(['admin', 'maintain', 'write']))
    .default(['admin', 'maintain', 'write']),
});
const ReleaseSchema = z.object({ enabled: z.boolean().default(true) });
const PrivacySchema = z.object({
  telemetry: z.boolean().default(false),
  debugPrompts: z.boolean().default(false),
});
export const ConfigSchema = z
  .object({
    version: z.literal(1),
    review: ReviewSchema.default({}),
    issues: IssuesSchema.default({}),
    commands: CommandsSchema.default({}),
    releaseNotes: ReleaseSchema.default({}),
    privacy: PrivacySchema.default({}),
  })
  .strict();
export type OpenMaintainerConfig = z.infer<typeof ConfigSchema>;
export const defaultConfig: OpenMaintainerConfig = ConfigSchema.parse({ version: 1 });
export const defaultConfigYaml = `# OpenMaintainer configuration. See docs/configuration.md.\n${stringify(defaultConfig)}`;

export function parseConfig(value: unknown): OpenMaintainerConfig {
  const result = ConfigSchema.safeParse(value);
  if (!result.success)
    throw new ConfigurationError(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
    );
  return result.data;
}
export async function loadConfig(path = '.openmaintainer.yml'): Promise<OpenMaintainerConfig> {
  try {
    await access(path);
  } catch {
    return defaultConfig;
  }
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    throw new ConfigurationError(
      `Cannot read ${path}: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  try {
    return parseConfig(parse(source));
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError(
      `Cannot parse ${path}: ${error instanceof Error ? error.message : 'invalid YAML'}`,
    );
  }
}
export function configValidationMessage(error: unknown): string {
  return error instanceof ConfigurationError ? error.message : 'Configuration is invalid.';
}
