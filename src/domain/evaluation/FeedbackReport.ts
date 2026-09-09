/**
 * What the learner reads. Assembled by the pipeline, never by an evaluator:
 * an evaluator's job is to produce findings about its own slice, and deciding
 * what the whole picture means is a separate responsibility.
 */

import type { RubricScore } from "../rubric/Rubric";
import type { BlastRadiusResult } from "./BlastRadius";
import type { Finding } from "./Finding";

export interface EvaluatorRun {
  readonly evaluatorId: string;
  readonly label: string;
  readonly ok: boolean;
  readonly note?: string;
  readonly durationMs: number;
}

export interface FeedbackReport {
  readonly rubricId: string;
  readonly rubricVersion: number;
  readonly score: RubricScore;
  readonly findings: readonly Finding[];
  readonly blastRadius: BlastRadiusResult | null;
  readonly summary: string;
  readonly strengths: readonly string[];
  /** At most three. A list of twelve improvements is a list nobody acts on. */
  readonly nextActions: readonly string[];
  readonly runs: readonly EvaluatorRun[];
  /** Findings dropped because their evidence pointed at nothing real. */
  readonly discardedFindings: number;
  /** True when at least one evaluator failed and the report is partial. */
  readonly degraded: boolean;
}
