/**
 * Round two: scores what the design had to touch when the requirement changed.
 *
 * This is the only criterion in the rubric with an objective answer, and it is
 * where the product's argument lives. Most of the work is arithmetic on the
 * learner's own impact tagging. The model is given one narrow job on top of
 * that, and only if it is available at all: look for classes the learner marked
 * UNCHANGED that plausibly cannot be. That is a checkable question about a
 * specific claim, which is a very different thing from asking a model whether a
 * design is good.
 */

import { computeBlastRadius } from "../evaluation/BlastRadius";
import type { EvaluationContext, Evaluator, EvaluatorOutput } from "../evaluation/Evaluator";
import type { Finding } from "../evaluation/Finding";
import type { LlmClient } from "../ports/index";

interface HonestyCheck {
  contested: Array<{ entityId: string; why: string }>;
}

const HONESTY_SCHEMA = {
  type: "object",
  properties: {
    contested: {
      type: "array",
      description: "Classes marked UNCHANGED that would in fact have to change. Empty if the tagging is defensible.",
      items: {
        type: "object",
        properties: {
          entityId: { type: "string", description: "Must be one of the entity ids given in the prompt." },
          why: { type: "string", description: "One sentence naming the concrete change this class would need." },
        },
        required: ["entityId", "why"],
      },
    },
  },
  required: ["contested"],
} as const;

export class BlastRadiusEvaluator implements Evaluator {
  readonly id = "blast-radius";
  readonly label = "Change test";
  readonly criteria = ["extensibility"];

  constructor(private readonly llm: LlmClient | null = null) {}

  /** Sits out the first round entirely, so no other component needs a null check. */
  supports(context: EvaluationContext): boolean {
    return context.kind === "CHANGE_TEST" && context.changeTestResponse !== null;
  }

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutput> {
    const response = context.changeTestResponse;
    if (!response) throw new Error("BlastRadiusEvaluator ran without a change-test response.");

    const result = computeBlastRadius(context.document, response, context.problem.changeTest);
    const findings: Finding[] = [];

    const pct = Math.round(result.radius * 100);
    const parPct = Math.round(result.par * 100);
    const missingSeams = result.seams.filter((s) => !s.satisfied);

    findings.push({
      criterionId: "extensibility",
      level: result.level,
      source: "DETERMINISTIC",
      evaluatorId: this.id,
      headline: result.claimedNoChange
        ? "The change was marked as needing no work at all"
        : `The change touched ${pct}% of the design against a par of ${parPct}%`,
      evidence: response.impacts
        .filter((i) => i.verdict === "MODIFIED" && context.document.hasEntity(i.entityId))
        .map((i) => ({ kind: "ENTITY" as const, id: i.entityId })),
      concern: result.claimedNoChange
        ? "A new requirement that costs nothing usually means it was not modelled, not that the design absorbed it."
        : missingSeams.length > 0
          ? `The design had no separate home for: ${missingSeams.map((s) => s.seam.label).join(", ")}.`
          : "",
      suggestion: result.claimedNoChange
        ? "Work through the requirement class by class and name where the new behaviour physically lives."
        : missingSeams.length > 0
          ? `Next attempt, put ${missingSeams[0]!.seam.label.toLowerCase()} behind its own abstraction before the change arrives.`
          : "",
      confidence: "HIGH",
    });

    for (const seam of result.seams) {
      findings.push({
        criterionId: "extensibility",
        level: seam.satisfied ? "L2" : "L0",
        source: "HEURISTIC",
        evaluatorId: this.id,
        headline: seam.satisfied
          ? `${seam.seam.label} already had a seam: ${seam.matchedEntityName}`
          : `${seam.seam.label} had nowhere to go`,
        evidence: seam.matchedEntityId ? [{ kind: "ENTITY" as const, id: seam.matchedEntityId }] : [],
        concern: seam.satisfied ? "" : seam.seam.explanation,
        suggestion: "",
        confidence: "MEDIUM",
      });
    }

    const note = `${result.modifiedCount} modified, ${result.newCount} added, ${result.unchangedCount} untouched`;

    const contested = await this.honestyCheck(context, response);
    for (const item of contested) {
      findings.push({
        criterionId: "extensibility",
        level: "L1",
        source: "LLM",
        evaluatorId: this.id,
        headline: `${context.document.entity(item.entityId)?.name ?? item.entityId} was marked unchanged, but probably is not`,
        evidence: [{ kind: "ENTITY", id: item.entityId }],
        concern: item.why,
        suggestion: "Re-check this one. Under-reporting impact hides the cost the design actually carries.",
        confidence: "LOW",
      });
    }

    return { findings, blastRadius: result, note };
  }

  /**
   * Best effort. A failure here must not fail the change test, because the
   * score does not depend on it - it is a second opinion on one specific claim.
   */
  private async honestyCheck(
    context: EvaluationContext,
    response: NonNullable<EvaluationContext["changeTestResponse"]>,
  ): Promise<HonestyCheck["contested"]> {
    if (!this.llm?.available) return [];

    const unchanged = response.impacts.filter(
      (i) => i.verdict === "UNCHANGED" && context.document.hasEntity(i.entityId),
    );
    if (unchanged.length === 0) return [];

    try {
      const raw = await this.llm.requestStructured({
        system:
          "You audit one specific claim about a software design. You never rate the design and never suggest improvements. " +
          "You only report classes that were claimed to need no change but demonstrably would need one.",
        toolName: "report_contested_claims",
        toolDescription: "Report classes wrongly marked as needing no change.",
        schema: HONESTY_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 1024,
        prompt: [
          `New requirement: ${context.problem.changeTest.requirement}`,
          "",
          "Classes the learner says need no change:",
          ...unchanged.map((i) => {
            const entity = context.document.entity(i.entityId)!;
            return `- id=${i.entityId} name=${entity.name} responsibility="${entity.responsibility}" methods=[${entity.methods.join(", ")}] learner_reason="${i.rationale}"`;
          }),
          "",
          "Return only ids from the list above. If every claim is defensible, return an empty array.",
        ].join("\n"),
      });

      const parsed = raw as Partial<HonestyCheck>;
      if (!Array.isArray(parsed?.contested)) return [];

      // Trust nothing from the far side: ids must be ones we sent.
      const allowed = new Set(unchanged.map((i) => i.entityId));
      return parsed.contested
        .filter((c) => c && typeof c.entityId === "string" && allowed.has(c.entityId))
        .map((c) => ({ entityId: c.entityId, why: String(c.why ?? "").slice(0, 400) }))
        .slice(0, 5);
    } catch {
      return [];
    }
  }
}
