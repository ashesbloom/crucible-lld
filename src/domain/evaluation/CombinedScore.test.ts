import { describe, expect, it } from "vitest";
import { combineReports } from "./CombinedScore";
import type { FeedbackReport } from "./FeedbackReport";
import type { Finding } from "./Finding";
import type { BlastRadiusResult } from "./BlastRadius";
import { LLD_V1 } from "../rubric/rubrics/lldV1";
import type { EvaluationSource, LevelId } from "../rubric/Rubric";

function finding(criterionId: string, level: LevelId, source: EvaluationSource): Finding {
  return {
    criterionId, level, source, evaluatorId: "test",
    headline: "", evidence: [], concern: "", suggestion: "", confidence: "HIGH",
  };
}

function report(findings: Finding[], extras: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    rubricId: "lld-v1", rubricVersion: 1,
    score: LLD_V1.score(findings),
    findings, blastRadius: null, summary: "", strengths: [], nextActions: [],
    runs: [], discardedFindings: 0, degraded: false,
    ...extras,
  };
}

const judged = report([
  finding("requirement-coverage", "L2", "DETERMINISTIC"),
  finding("responsibility-clarity", "L3", "LLM"),
  finding("abstraction", "L2", "LLM"),
  finding("coupling-cohesion", "L2", "LLM"),
  finding("reasoning", "L1", "LLM"),
]);

const blast = { radius: 0.25, par: 0.3, band: "CONTAINED" } as BlastRadiusResult;
const changeTest = report(
  [finding("requirement-coverage", "L2", "DETERMINISTIC"), finding("extensibility", "L3", "DETERMINISTIC")],
  { blastRadius: blast },
);

describe("combining both rounds", () => {
  it("returns nothing when neither round has been evaluated", () => {
    expect(combineReports(LLD_V1, [null, null])).toBeNull();
  });

  it("covers the whole rubric only once both rounds exist", () => {
    // Each round on its own leaves a hole: the first cannot score extensibility,
    // the second does not re-judge the design.
    expect(combineReports(LLD_V1, [judged, null])!.score.coverage).toBe(80);
    expect(combineReports(LLD_V1, [null, changeTest])!.score.coverage).toBe(35);
    expect(combineReports(LLD_V1, [judged, changeTest])!.score.coverage).toBe(100);
  });

  it("keeps the judged criteria that only the first round produced", () => {
    const combined = combineReports(LLD_V1, [judged, changeTest])!;
    const clarity = combined.score.criteria.find((c) => c.criterionId === "responsibility-clarity")!;
    expect(clarity.level).toBe("L3");
    expect(clarity.scoredBy).toBe("LLM");
  });

  it("takes extensibility from the round that actually measured it", () => {
    const combined = combineReports(LLD_V1, [judged, changeTest])!;
    const extensibility = combined.score.criteria.find((c) => c.criterionId === "extensibility")!;
    expect(extensibility.level).toBe("L3");
    expect(combined.blastRadius).toBe(blast);
  });

  it("carries a degraded round forward rather than hiding it", () => {
    const broken = report([], { degraded: true });
    expect(combineReports(LLD_V1, [judged, broken])!.degraded).toBe(true);
  });

  it("is order independent, because scoring is pure", () => {
    const a = combineReports(LLD_V1, [judged, changeTest])!;
    const b = combineReports(LLD_V1, [changeTest, judged])!;
    expect(a.score.overall).toBe(b.score.overall);
  });
});
