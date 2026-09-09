/**
 * One observation about a design.
 *
 * The shape follows the brief's suggested evaluation form deliberately:
 * criterion -> level -> evidence -> concern -> suggestion -> confidence.
 * The important field is `evidence`. A finding that cannot point at something
 * the learner actually wrote is not feedback, it is an opinion, and
 * `EvidenceResolver` throws those away.
 */

import type { EvaluationSource, LevelId } from "../rubric/Rubric";

export type EvidenceRef =
  | { readonly kind: "ENTITY"; readonly id: string }
  | { readonly kind: "DECISION"; readonly index: number }
  | { readonly kind: "REQUIREMENT"; readonly index: number }
  | { readonly kind: "ASSUMPTION"; readonly index: number };

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export interface Finding {
  readonly criterionId: string;
  readonly level: LevelId;
  readonly source: EvaluationSource;
  readonly evaluatorId: string;
  /** The verdict in one line. Shown as the card title. */
  readonly headline: string;
  readonly evidence: readonly EvidenceRef[];
  /** What is wrong or risky. Empty when the finding is purely positive. */
  readonly concern: string;
  /** What to do about it next attempt. */
  readonly suggestion: string;
  readonly confidence: Confidence;
}

export function evidenceKey(ref: EvidenceRef): string {
  return ref.kind === "ENTITY" ? `ENTITY:${ref.id}` : `${ref.kind}:${ref.index}`;
}
