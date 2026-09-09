/**
 * The stand-in for when no API key is configured.
 *
 * This is not canned text. Returning a fixed report would make the demo a lie:
 * a reviewer would type a deliberately terrible design and get told it was
 * fine. Instead this derives each level from measurable properties of the
 * document actually submitted, so the feedback moves when the design moves.
 *
 * It is labelled HEURISTIC everywhere it surfaces, and the rubric only lets it
 * stand in for a criterion whose real owner did not answer. It is a floor on
 * usefulness, not a replacement for reading the design.
 *
 * ponytail: proxy metrics, not comprehension. Upgrade path is the API key.
 */

import type { DesignDocument } from "../design/DesignDocument";
import type { EvaluationContext, Evaluator, EvaluatorOutput } from "../evaluation/Evaluator";
import type { Finding } from "../evaluation/Finding";
import type { LlmClient } from "../ports/index";
import type { LevelId } from "../rubric/Rubric";

/** Classic dumping grounds: a class named this usually absorbed leftovers. */
const CATCH_ALL_NAMES = /(manager|helper|util|handler|processor|service)$/i;
const REVISIT_WORDS = ["revisit", "if we", "when we", "once ", "until ", "unless", "beyond "];

export class HeuristicRubricEvaluator implements Evaluator {
  readonly id = "heuristic";
  readonly label = "Heuristic review";
  readonly criteria = ["responsibility-clarity", "abstraction", "coupling-cohesion", "reasoning"];

  constructor(private readonly llm: LlmClient | null = null) {}

  /**
   * Stands down whenever the real evaluator can run. Both could run harmlessly
   * - the rubric prefers the owner - but two verdicts on one criterion in the
   * findings list is noise for the learner reading it.
   */
  supports(context: EvaluationContext): boolean {
    return !this.llm?.available && context.kind === "INITIAL" && !context.document.isEmpty();
  }

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutput> {
    const d = context.document;
    return {
      findings: [
        this.responsibility(d),
        this.abstraction(d),
        this.coupling(d),
        this.reasoning(d),
      ],
      note: "no API key, scoring from structural proxies",
    };
  }

  private finding(
    criterionId: string,
    level: LevelId,
    headline: string,
    concern: string,
    suggestion: string,
    evidence: Finding["evidence"] = [],
  ): Finding {
    return {
      criterionId, level, source: "HEURISTIC", evaluatorId: this.id,
      headline, evidence, concern, suggestion, confidence: "LOW",
    };
  }

  private responsibility(d: DesignDocument): Finding {
    if (d.isEmpty()) {
      return this.finding("responsibility-clarity", "L0", "No classes to assess", "", "Add the classes your design needs.");
    }

    const withResponsibility = d.entities.filter((e) => e.responsibility.trim().length > 0);
    const ratio = withResponsibility.length / d.entityCount;
    const gods = d.godClasses(8);
    const catchAlls = d.entities.filter((e) => CATCH_ALL_NAMES.test(e.name));
    const averageWords =
      withResponsibility.reduce((sum, e) => sum + e.responsibility.trim().split(/\s+/).length, 0) /
      Math.max(withResponsibility.length, 1);

    let level: LevelId;
    if (ratio < 0.5) level = "L0";
    else if (ratio < 1 || gods.length > 0) level = "L1";
    else if (averageWords >= 5 && catchAlls.length === 0) level = "L3";
    else level = "L2";

    return this.finding(
      "responsibility-clarity",
      level,
      `${withResponsibility.length} of ${d.entityCount} classes state a responsibility`,
      catchAlls.length > 0
        ? `${catchAlls.map((e) => e.name).join(", ")} named as a role rather than a thing, which is where leftover behaviour tends to collect.`
        : gods.length > 0
          ? `${gods.map((e) => e.name).join(", ")} hold enough methods to be worth splitting.`
          : "",
      level === "L3" ? "" : "State one sentence per class describing the single reason it would change.",
      catchAlls.map((e) => ({ kind: "ENTITY" as const, id: e.id })),
    );
  }

  private abstraction(d: DesignDocument): Finding {
    const abstractions = d.entities.filter(
      (e) => e.stereotype === "INTERFACE" || e.stereotype === "STRATEGY",
    );

    const implementorsOf = new Map<string, number>();
    for (const r of d.relations) {
      if (r.kind === "IMPLEMENTS" || r.kind === "IS_A") {
        implementorsOf.set(r.toId, (implementorsOf.get(r.toId) ?? 0) + 1);
      }
    }
    const bestUsed = Math.max(0, ...abstractions.map((a) => implementorsOf.get(a.id) ?? 0));
    const namedInDecision = abstractions.some((a) =>
      d.decisions.some((dec) => `${dec.title} ${dec.rationale}`.toLowerCase().includes(a.name.toLowerCase())),
    );

    let level: LevelId;
    if (abstractions.length === 0) level = "L0";
    else if (bestUsed < 2) level = "L1";
    else if (namedInDecision) level = "L3";
    else level = "L2";

    return this.finding(
      "abstraction",
      level,
      abstractions.length === 0
        ? "No interfaces or strategies in the design"
        : `${abstractions.length} abstraction${abstractions.length === 1 ? "" : "s"}, the most-used has ${bestUsed} implementation${bestUsed === 1 ? "" : "s"}`,
      level === "L1"
        ? "An interface with a single implementation is indirection, not abstraction, until a second one exists."
        : "",
      level === "L0"
        ? "Pick the behaviour most likely to vary and put an interface in front of it."
        : level === "L1"
          ? "Name the second implementation you expect, or drop the interface until you need it."
          : "",
      abstractions.map((a) => ({ kind: "ENTITY" as const, id: a.id })),
    );
  }

  private coupling(d: DesignDocument): Finding {
    const density = d.relationDensity();
    const dangling = d.danglingRelations().length;
    const orphans = d.orphanEntities().length;
    const kinds = new Set(d.relations.map((r) => r.kind)).size;

    let level: LevelId;
    if (d.relations.length === 0 && d.entityCount > 1) level = "L0";
    else if (density > 4) level = "L0";
    else if (dangling > 0 || density < 0.5) level = "L1";
    else if (orphans === 0 && kinds >= 2) level = "L3";
    else level = "L2";

    return this.finding(
      "coupling-cohesion",
      level,
      `${d.relations.length} relationships across ${d.entityCount} classes, ${density.toFixed(1)} per class`,
      density > 4
        ? "Nearly everything is connected to nearly everything, so no part can be changed in isolation."
        : density < 0.5 && d.entityCount > 1
          ? "Most classes record no collaborators, so this reads as a class list rather than a design."
          : "",
      level === "L3" ? "" : "Record how each class reaches the ones it needs, and which direction the dependency points.",
    );
  }

  private reasoning(d: DesignDocument): Finding {
    const total = d.decisions.length;
    const withAlternative = d.decisions.filter((x) => x.alternativeRejected.trim().length > 0).length;
    const hasRevisit = d.decisions.some((x) => {
      const text = `${x.rationale} ${x.alternativeRejected}`.toLowerCase();
      return REVISIT_WORDS.some((w) => text.includes(w));
    });

    let level: LevelId;
    if (total === 0) level = "L0";
    else if (withAlternative < total / 2) level = "L1";
    else if (withAlternative === total && hasRevisit) level = "L3";
    else level = "L2";

    return this.finding(
      "reasoning",
      level,
      total === 0
        ? "No design decisions recorded"
        : `${withAlternative} of ${total} decisions name the alternative they rejected`,
      total === 0
        ? "Without recorded trade-offs there is no way to tell a deliberate choice from a default."
        : withAlternative < total
          ? "A decision with no rejected alternative is usually a default that was never examined."
          : "",
      level === "L3" ? "" : "For each decision, write the option you turned down and what would make you change your mind.",
      d.decisions.map((_, index) => ({ kind: "DECISION" as const, index })),
    );
  }
}
