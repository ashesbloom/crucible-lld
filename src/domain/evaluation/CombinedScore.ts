/**
 * One attempt's full picture, across both rounds.
 *
 * The two evaluations deliberately cover different criteria. The first round
 * judges the design; the change-test round only runs the deterministic
 * evaluators, because the design has not changed between them and re-asking a
 * model the same question would cost money to produce the same answer.
 *
 * So neither report alone is the attempt's score. The first is missing
 * extensibility, the second is missing everything a model judged. Combining
 * them is safe precisely because `Rubric.score` is pure: the same findings
 * always give the same number, so re-scoring the union is not a second opinion,
 * it is the same arithmetic over more evidence.
 */

import type { Rubric, RubricScore } from "../rubric/Rubric";
import type { BlastRadiusResult } from "./BlastRadius";
import type { FeedbackReport } from "./FeedbackReport";

export interface CombinedScore {
  readonly score: RubricScore;
  readonly blastRadius: BlastRadiusResult | null;
  readonly degraded: boolean;
}

export function combineReports(
  rubric: Rubric,
  reports: readonly (FeedbackReport | null)[],
): CombinedScore | null {
  const present = reports.filter((r): r is FeedbackReport => r !== null);
  if (present.length === 0) return null;

  return {
    score: rubric.score(present.flatMap((report) => report.findings)),
    blastRadius: present.find((report) => report.blastRadius)?.blastRadius ?? null,
    degraded: present.some((report) => report.degraded),
  };
}
