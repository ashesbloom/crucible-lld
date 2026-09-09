import { describe, expect, it } from "vitest";
import type { Finding } from "../evaluation/Finding";
import { LLD_V1 } from "./rubrics/lldV1";
import type { EvaluationSource, LevelId } from "./Rubric";

function finding(criterionId: string, level: LevelId, source: EvaluationSource): Finding {
  return {
    criterionId, level, source,
    evaluatorId: "test",
    headline: "",
    evidence: [],
    concern: "",
    suggestion: "",
    confidence: "HIGH",
  };
}

const allCriteria = LLD_V1.criteria.map((c) => c.id);

describe("Rubric scoring", () => {
  it("weights sum to 100, so the overall score is a percentage and not a coincidence", () => {
    expect(LLD_V1.criteria.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
  });

  it("gives every criterion four levels with distinct descriptors", () => {
    for (const criterion of LLD_V1.criteria) {
      expect(criterion.levels).toHaveLength(4);
      expect(new Set(criterion.levels.map((l) => l.descriptor)).size).toBe(4);
    }
  });

  it("scores an unassessed rubric as zero and says so", () => {
    const score = LLD_V1.score([]);
    expect(score.overall).toBe(0);
    expect(score.coverage).toBe(0);
    expect(score.band).toBe("Needs work");
    expect(score.criteria.every((c) => !c.assessed)).toBe(true);
  });

  it("does not count a criterion nobody assessed against the learner", () => {
    // Extensibility cannot be scored until the change test has been answered.
    // Folding it in as zero would tell every learner their first design was 20
    // points worse than it is.
    const perfectExceptUnrun = LLD_V1.criteria
      .filter((c) => c.id !== "extensibility")
      .map((c) => finding(c.id, "L3", c.authoritativeSource));

    const score = LLD_V1.score(perfectExceptUnrun);
    expect(score.overall).toBe(100);
    expect(score.coverage).toBe(80);
    expect(score.criteria.find((c) => c.criterionId === "extensibility")!.assessed).toBe(false);
  });

  it("reports coverage so a partial score cannot pass for a complete one", () => {
    // responsibility-clarity is 20 and reasoning is 10, of 100.
    const score = LLD_V1.score([
      finding("responsibility-clarity", "L2", "LLM"),
      finding("reasoning", "L2", "LLM"),
    ]);
    expect(score.coverage).toBe(30);
  });

  it("scores full marks when every criterion is L3", () => {
    const findings = LLD_V1.criteria.map((c) => finding(c.id, "L3", c.authoritativeSource));
    expect(LLD_V1.score(findings).overall).toBe(100);
    expect(LLD_V1.score(findings).band).toBe("Strong");
  });

  it("is deterministic: the same findings always produce the same number", () => {
    const findings = allCriteria.map((id, i) =>
      finding(id, (["L0", "L1", "L2", "L3"] as const)[i % 4]!, LLD_V1.criterion(id)!.authoritativeSource),
    );
    const runs = new Set(Array.from({ length: 20 }, () => LLD_V1.score(findings).overall));
    expect(runs.size).toBe(1);
  });

  it("ignores a verdict from an evaluator that does not own the criterion", () => {
    // An LLM must not be able to overrule the arithmetic on requirement coverage.
    const score = LLD_V1.score([finding("requirement-coverage", "L3", "LLM")]);
    const coverage = score.criteria.find((c) => c.criterionId === "requirement-coverage")!;
    expect(coverage.level).toBe("L0");
    expect(coverage.assessed).toBe(false);
  });

  it("lets the heuristic stand in when the owning evaluator did not answer", () => {
    const score = LLD_V1.score([finding("responsibility-clarity", "L2", "HEURISTIC")]);
    const clarity = score.criteria.find((c) => c.criterionId === "responsibility-clarity")!;
    expect(clarity.level).toBe("L2");
    expect(clarity.assessed).toBe(true);
    expect(clarity.source).toBe("LLM");
    expect(clarity.scoredBy).toBe("HEURISTIC");
  });

  it("prefers the owning evaluator over the stand-in when both answered", () => {
    const score = LLD_V1.score([
      finding("responsibility-clarity", "L0", "HEURISTIC"),
      finding("responsibility-clarity", "L3", "LLM"),
    ]);
    const clarity = score.criteria.find((c) => c.criterionId === "responsibility-clarity")!;
    expect(clarity.level).toBe("L3");
    expect(clarity.scoredBy).toBe("LLM");
  });

  it("weights heavier criteria more than lighter ones", () => {
    // Same two criteria assessed both times, only which one scored well differs.
    // responsibility-clarity carries 20 of the rubric, reasoning carries 10.
    const heavyScoredWell = LLD_V1.score([
      finding("responsibility-clarity", "L3", "LLM"),
      finding("reasoning", "L0", "LLM"),
    ]);
    const lightScoredWell = LLD_V1.score([
      finding("responsibility-clarity", "L0", "LLM"),
      finding("reasoning", "L3", "LLM"),
    ]);

    expect(heavyScoredWell.overall).toBe(67);
    expect(lightScoredWell.overall).toBe(33);
    expect(heavyScoredWell.coverage).toBe(lightScoredWell.coverage);
  });
});
