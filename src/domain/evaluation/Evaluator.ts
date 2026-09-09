/**
 * The extensibility seam the brief's Change Test B asks about.
 *
 * Adding a rule-based checker, a human reviewer, or a test-execution evaluator
 * means writing one more class that implements this. The practice flow, the
 * rubric, the persistence layer and the UI are all unaware, because none of
 * them names a concrete evaluator anywhere. The pipeline is handed a list.
 */

import type { DesignDocument } from "../design/DesignDocument";
import type { Problem } from "../problem/Problem";
import type { Rubric } from "../rubric/Rubric";
import type { SubmissionKind } from "../attempt/Attempt";
import type { BlastRadiusResult, ChangeTestResponse } from "./BlastRadius";
import type { Finding } from "./Finding";

export interface EvaluationContext {
  readonly problem: Problem;
  readonly rubric: Rubric;
  readonly document: DesignDocument;
  readonly kind: SubmissionKind;
  readonly changeTestResponse: ChangeTestResponse | null;
}

export interface EvaluatorOutput {
  readonly findings: readonly Finding[];
  readonly blastRadius?: BlastRadiusResult;
  /** Shown next to the stage in the UI, e.g. "no API key, using heuristics". */
  readonly note?: string;
}

export interface Evaluator {
  readonly id: string;
  readonly label: string;
  /** Criteria this evaluator is allowed to speak to. Used for display, not enforcement. */
  readonly criteria: readonly string[];
  /** Lets the change-test evaluator sit out the first round without a null check elsewhere. */
  supports(context: EvaluationContext): boolean;
  evaluate(context: EvaluationContext): Promise<EvaluatorOutput>;
}
