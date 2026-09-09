import { describe, expect, it } from "vitest";
import { EvaluationPipeline } from "./EvaluationPipeline";
import type { EvaluationContext, Evaluator, EvaluatorOutput } from "./Evaluator";
import type { Finding } from "./Finding";
import { FixedClock } from "../ports/index";
import { LLD_V1 } from "../rubric/rubrics/lldV1";
import { design, entity, problem } from "../testing/fixtures";

const clock = new FixedClock(new Date("2026-09-09T10:00:00Z"));

const context: EvaluationContext = {
  problem: problem(),
  rubric: LLD_V1,
  document: design({ entities: [entity("lot"), entity("spot")] }),
  kind: "INITIAL",
  changeTestResponse: null,
};

function stub(id: string, findings: Finding[], options: { fails?: boolean; supports?: boolean } = {}): Evaluator {
  return {
    id,
    label: id,
    criteria: findings.map((f) => f.criterionId),
    supports: () => options.supports ?? true,
    evaluate: async (): Promise<EvaluatorOutput> => {
      if (options.fails) throw new Error(`${id} exploded`);
      return { findings };
    },
  };
}

function finding(criterionId: string, level: Finding["level"], source: Finding["source"]): Finding {
  return {
    criterionId, level, source,
    evaluatorId: "test",
    headline: `${criterionId} was ${level}`,
    evidence: [],
    concern: "something",
    suggestion: `Fix ${criterionId}`,
    confidence: "HIGH",
  };
}

describe("EvaluationPipeline", () => {
  it("only plans the evaluators that support the context", () => {
    const pipeline = new EvaluationPipeline(
      [stub("a", []), stub("b", [], { supports: false })],
      clock,
    );
    expect(pipeline.plan(context).map((e) => e.id)).toEqual(["a"]);
  });

  it("merges findings from every evaluator into one score", async () => {
    const pipeline = new EvaluationPipeline(
      [
        stub("det", [finding("requirement-coverage", "L3", "DETERMINISTIC")]),
        stub("llm", [finding("responsibility-clarity", "L2", "LLM")]),
      ],
      clock,
    );
    const report = await pipeline.run(context);
    expect(report.findings).toHaveLength(2);
    expect(report.degraded).toBe(false);
    expect(report.score.overall).toBeGreaterThan(0);
  });

  it("degrades instead of failing when one evaluator throws", async () => {
    // The original used Promise.all, so a failing LLM call threw away the
    // deterministic findings that had already succeeded and left the learner
    // with an error page instead of half a report.
    const pipeline = new EvaluationPipeline(
      [
        stub("det", [finding("requirement-coverage", "L3", "DETERMINISTIC")]),
        stub("llm", [], { fails: true }),
      ],
      clock,
    );

    const report = await pipeline.run(context);
    expect(report.degraded).toBe(true);
    expect(report.findings).toHaveLength(1);
    expect(report.runs.find((r) => r.evaluatorId === "llm")!.ok).toBe(false);
    expect(report.runs.find((r) => r.evaluatorId === "llm")!.note).toContain("exploded");
    expect(report.summary).toContain("did not finish");
  });

  it("still produces a report when every evaluator fails", async () => {
    const pipeline = new EvaluationPipeline([stub("a", [], { fails: true })], clock);
    const report = await pipeline.run(context);
    expect(report.degraded).toBe(true);
    expect(report.score.overall).toBe(0);
  });

  it("reports how many findings were discarded for citing nothing real", async () => {
    const grounded = { ...finding("responsibility-clarity", "L2", "LLM"), evidence: [{ kind: "ENTITY" as const, id: "lot" }] };
    const invented = { ...finding("abstraction", "L0", "LLM"), evidence: [{ kind: "ENTITY" as const, id: "nope" }] };

    const report = await new EvaluationPipeline([stub("llm", [grounded, invented])], clock).run(context);
    expect(report.discardedFindings).toBe(1);
    expect(report.findings).toHaveLength(1);
  });

  it("notifies a listener as each stage settles", async () => {
    const seen: string[] = [];
    const pipeline = new EvaluationPipeline([stub("a", []), stub("b", [], { fails: true })], clock);
    await pipeline.run(context, (run) => seen.push(`${run.evaluatorId}:${run.ok}`));
    expect(seen).toEqual(["a:true", "b:false"]);
  });

  it("offers at most three next actions, weakest and heaviest first", async () => {
    const pipeline = new EvaluationPipeline(
      [
        stub("x", [
          finding("reasoning", "L1", "LLM"),
          finding("responsibility-clarity", "L0", "LLM"),
          finding("abstraction", "L1", "LLM"),
          finding("coupling-cohesion", "L1", "LLM"),
        ]),
      ],
      clock,
    );
    const report = await pipeline.run(context);
    expect(report.nextActions).toHaveLength(3);
    expect(report.nextActions[0]).toBe("Fix responsibility-clarity");
    expect(report.nextActions[1]).toBe("Fix abstraction");
  });

  it("lists only what the learner did well as strengths", async () => {
    const pipeline = new EvaluationPipeline(
      [stub("x", [finding("reasoning", "L3", "LLM"), finding("abstraction", "L0", "LLM")])],
      clock,
    );
    const report = await pipeline.run(context);
    expect(report.strengths).toEqual(["reasoning was L3"]);
  });
});
