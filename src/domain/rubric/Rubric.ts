/**
 * The rubric.
 *
 * Two decisions here carry most of the weight of this project.
 *
 * First, levels are ordinal bands described by *observable behaviour*, not a
 * 1-10 score and not adjectives. "Every class states a responsibility and no
 * class owns more than one reason to change" can be agreed on by two readers.
 * "Responsibilities are mostly clear" cannot, and an LLM asked to produce the
 * latter will drift between runs and cluster everything in the middle.
 *
 * Second, every criterion declares which evaluator is *authoritative* for it.
 * That is what makes the deterministic/AI split real rather than rhetorical:
 * Requirement Coverage is arithmetic and an LLM cannot override it, while
 * Responsibility Clarity is a judgement call and the deterministic checks can
 * only contribute supporting notes.
 */

import type { Finding } from "../evaluation/Finding";

export const LEVELS = ["L0", "L1", "L2", "L3"] as const;
export type LevelId = (typeof LEVELS)[number];

export const LEVEL_VALUE: Record<LevelId, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
export const LEVEL_NAME: Record<LevelId, string> = {
  L0: "Missing",
  L1: "Emerging",
  L2: "Solid",
  L3: "Strong",
};

/**
 * Who produced a finding.
 *
 * HEURISTIC is the no-API-key fallback and is kept separate from DETERMINISTIC
 * on purpose. Both are computed locally, but DETERMINISTIC means "this is
 * countable and the answer is exact" while HEURISTIC means "we inferred a
 * judgement from measurable proxies because no model was available". Collapsing
 * them would let the UI claim a confidence the fallback has not earned.
 */
export type EvaluationSource = "DETERMINISTIC" | "LLM" | "HEURISTIC";

/** Only these two can own a criterion. HEURISTIC only ever stands in. */
export type AuthoritativeSource = Extract<EvaluationSource, "DETERMINISTIC" | "LLM">;

export interface LevelDescriptor {
  readonly level: LevelId;
  /** Written as something a reader could check, not as praise or blame. */
  readonly descriptor: string;
}

export interface Criterion {
  readonly id: string;
  readonly name: string;
  readonly question: string;
  readonly weight: number;
  readonly authoritativeSource: AuthoritativeSource;
  readonly why: string;
  readonly levels: readonly LevelDescriptor[];
}

export interface CriterionScore {
  readonly criterionId: string;
  readonly level: LevelId;
  readonly value: number;
  readonly weight: number;
  /** Who the rubric wanted to hear from. */
  readonly source: AuthoritativeSource;
  /** Who actually answered. Differs from `source` when the fallback stood in. */
  readonly scoredBy: EvaluationSource | null;
  /** True when no evaluator produced a verdict, so this scored as L0 by default. */
  readonly assessed: boolean;
}

export interface RubricScore {
  readonly criteria: readonly CriterionScore[];
  /** Weighted, 0-100, over the criteria that were actually assessed. */
  readonly overall: number;
  readonly band: "Needs work" | "Developing" | "Solid" | "Strong";
  /** Share of the rubric's weight that produced a verdict, 0-100. */
  readonly coverage: number;
}

export class Rubric {
  readonly id: string;
  readonly version: number;
  readonly criteria: readonly Criterion[];

  constructor(id: string, version: number, criteria: readonly Criterion[]) {
    if (criteria.length === 0) throw new Error("A rubric needs at least one criterion.");
    this.id = id;
    this.version = version;
    this.criteria = criteria;
  }

  criterion(id: string): Criterion | undefined {
    return this.criteria.find((c) => c.id === id);
  }

  descriptorFor(criterionId: string, level: LevelId): string | undefined {
    return this.criterion(criterionId)?.levels.find((l) => l.level === level)?.descriptor;
  }

  /**
   * Pure aggregation. No I/O, no randomness, no clock. Given the same findings
   * this returns the same score forever, which is what makes an attempt history
   * comparable across weeks.
   *
   * A criterion with no finding from its authoritative source scores L0 and is
   * flagged `assessed: false`, so the UI can say "not assessed" instead of
   * silently implying the learner scored zero on merit.
   */
  score(findings: readonly Finding[]): RubricScore {
    const criteria = this.criteria.map((criterion): CriterionScore => {
      const forCriterion = findings.filter((f) => f.criterionId === criterion.id);

      // Ask the owner first. Fall back to the heuristic stand-in only if the
      // owner is absent, and never let an unrelated supporting finding decide a
      // criterion it does not own.
      const verdict =
        forCriterion.find((f) => f.source === criterion.authoritativeSource) ??
        forCriterion.find((f) => f.source === "HEURISTIC");

      const level = verdict?.level ?? "L0";
      return {
        criterionId: criterion.id,
        level,
        value: LEVEL_VALUE[level],
        weight: criterion.weight,
        source: criterion.authoritativeSource,
        scoredBy: verdict?.source ?? null,
        assessed: verdict !== undefined,
      };
    });

    // Only assessed criteria count toward the score.
    //
    // Scoring an unassessed criterion as zero conflates two different things: a
    // learner who did badly, and a criterion nobody has run yet. Extensibility
    // cannot be assessed until the change test has been answered, so a first
    // report that folded it in as zero would tell every learner their design
    // was worse than it is. `coverage` is reported alongside so a partial score
    // is never mistaken for a complete one.
    const assessed = criteria.filter((c) => c.assessed);
    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    const assessedWeight = assessed.reduce((sum, c) => sum + c.weight, 0);
    const earned = assessed.reduce((sum, c) => sum + c.value * c.weight, 0);

    const max = 3 * assessedWeight;
    const overall = max === 0 ? 0 : Math.round((earned / max) * 100);
    const coverage = totalWeight === 0 ? 0 : Math.round((assessedWeight / totalWeight) * 100);

    return { criteria, overall, band: bandFor(overall), coverage };
  }
}

function bandFor(overall: number): RubricScore["band"] {
  if (overall < 35) return "Needs work";
  if (overall < 60) return "Developing";
  if (overall < 82) return "Solid";
  return "Strong";
}

export interface RubricRegistry {
  get(id: string): Rubric;
}
