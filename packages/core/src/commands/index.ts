import type { OpenMaintainerConfig } from '@openmaintainer/config';
export type Command = 'help' | 'review' | 'summarize' | 'triage' | 'duplicates' | 'release-notes';
export function parseCommand(body: string, prefix = '/om'): Command | undefined {
  const first = body.trim().split(/\s+/)[0];
  if (first !== prefix) return undefined;
  const command = body.trim().split(/\s+/)[1] as Command | undefined;
  return command &&
    ['help', 'review', 'summarize', 'triage', 'duplicates', 'release-notes'].includes(command)
    ? command
    : command === undefined
      ? 'help'
      : undefined;
}
export function canRunCommand(role: string | undefined, config: OpenMaintainerConfig): boolean {
  if (!config.commands.enabled) return false;
  return (
    role !== undefined &&
    config.commands.allowedRoles.includes(role as 'admin' | 'maintain' | 'write' | 'triage')
  );
}
export function commandHelp(prefix = '/om'): string {
  return `Available commands: ${prefix} help, ${prefix} review, ${prefix} summarize, ${prefix} triage, ${prefix} duplicates, ${prefix} release-notes (CLI guidance; no automatic publication). Privileged commands require write, maintain, or admin repository access.`;
}
