import { type PullRequestFile, type ReviewFinding, type Risk } from '@openmaintainer/shared';
export function calculateRisk(input: {
  files: PullRequestFile[];
  findings: ReviewFinding[];
  partial?: boolean;
}): Risk {
  const sensitive = input.files.some((f) =>
    /auth|security|crypto|permission|migration|\.github\/workflows|dockerfile|package\.json/i.test(
      f.path,
    ),
  );
  const score = input.files.length > 20 ? 1 : 0;
  const findingScore = input.findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  )
    ? 2
    : input.findings.some((f) => f.severity === 'medium')
      ? 1
      : 0;
  const total = score + (sensitive ? 1 : 0) + findingScore + (input.partial ? 1 : 0);
  return total >= 3 ? 'high' : total >= 1 ? 'medium' : 'low';
}
