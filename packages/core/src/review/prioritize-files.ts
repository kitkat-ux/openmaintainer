import picomatch from 'picomatch';
import { type PullRequestFile } from '@openmaintainer/shared';
// picomatch provides tested globstar semantics; patterns are repository-root relative.
function isIgnored(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => picomatch(pattern, { dot: true, nonegate: true })(path));
}
function priority(file: PullRequestFile): number {
  const path = file.path.toLowerCase();
  if (/(^|\/)(dist|build|coverage|vendor|generated)(\/|$)|\.lock$|\.min\.js$/.test(path))
    return 100;
  if (
    /auth|security|middleware|permission|crypto|migration|workflow|dockerfile|package\.json/.test(
      path,
    )
  )
    return 0;
  if (/(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(path)) return 100;
  if (/test|spec/.test(path)) return 30;
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|cpp)$/.test(path)) return 10;
  if (/ya?ml|json|toml/.test(path)) return 20;
  return 40;
}
export function prioritizeFiles(
  files: PullRequestFile[],
  maxFiles: number,
  ignore: string[],
): { files: PullRequestFile[]; skipped: string[] } {
  const eligible = files.filter((file) => !file.binary && !isIgnored(file.path, ignore));
  const selected = [...eligible]
    .sort((a, b) => priority(a) - priority(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, maxFiles);
  const selectedPaths = new Set(selected.map((file) => file.path));
  return {
    files: selected,
    skipped: files.filter((file) => !selectedPaths.has(file.path)).map((file) => file.path),
  };
}
