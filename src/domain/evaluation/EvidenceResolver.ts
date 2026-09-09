/**
 * Throws away feedback that points at things the learner never wrote.
 *
 * This exists because of a real failure. The LLM evaluator confidently
 * criticised a `PaymentProcessor` class in a submission that contained no such
 * class. Adding "only reference classes present in the submission" to the
 * prompt reduced it and did not stop it, which is the general lesson: a prompt
 * expresses a preference, a validator gives a guarantee.
 *
 * The policy is deliberately not "drop anything suspicious":
 *   - No evidence claimed at all -> keep. Some deterministic findings are about
 *     the absence of things ("no interfaces anywhere"), and there is nothing to
 *     point at.
 *   - Some evidence resolves -> keep, with the unresolvable refs stripped.
 *   - Evidence claimed but none of it resolves -> drop the whole finding, because
 *     the reasoning was about a design that does not exist.
 */

import type { DesignDocument } from "../design/DesignDocument";
import type { EvidenceRef, Finding } from "./Finding";

export interface ResolutionResult {
  readonly kept: readonly Finding[];
  readonly discarded: readonly Finding[];
  /** Refs stripped from findings that otherwise survived. */
  readonly strippedRefs: number;
}

export class EvidenceResolver {
  constructor(
    private readonly document: DesignDocument,
    private readonly requirementCount: number,
  ) {}

  private resolves(ref: EvidenceRef): boolean {
    switch (ref.kind) {
      case "ENTITY":
        return this.document.hasEntity(ref.id);
      case "DECISION":
        return ref.index >= 0 && ref.index < this.document.decisions.length;
      case "ASSUMPTION":
        return ref.index >= 0 && ref.index < this.document.assumptions.length;
      case "REQUIREMENT":
        return ref.index >= 0 && ref.index < this.requirementCount;
    }
  }

  resolve(findings: readonly Finding[]): ResolutionResult {
    const kept: Finding[] = [];
    const discarded: Finding[] = [];
    let strippedRefs = 0;

    for (const finding of findings) {
      if (finding.evidence.length === 0) {
        kept.push(finding);
        continue;
      }

      const valid = finding.evidence.filter((ref) => this.resolves(ref));

      if (valid.length === 0) {
        discarded.push(finding);
        continue;
      }

      strippedRefs += finding.evidence.length - valid.length;
      kept.push(valid.length === finding.evidence.length ? finding : { ...finding, evidence: valid });
    }

    return { kept, discarded, strippedRefs };
  }
}
