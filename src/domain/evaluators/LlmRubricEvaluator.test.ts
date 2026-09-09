import { describe, expect, it } from "vitest";
import { LlmRubricEvaluator } from "./LlmRubricEvaluator";
import type { EvaluationContext } from "../evaluation/Evaluator";
import type { LlmClient, StructuredRequest } from "../ports/index";
import { LLD_V1 } from "../rubric/rubrics/lldV1";
import { design, entity, problem } from "../testing/fixtures";

class FakeLlm implements LlmClient {
  readonly id = "fake";
  calls: StructuredRequest[] = [];
  constructor(
    private readonly responses: unknown[],
    readonly available = true,
  ) {}

  async requestStructured(request: StructuredRequest): Promise<unknown> {
    this.calls.push(request);
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    return next;
  }
}

const context: EvaluationContext = {
  problem: problem(),
  rubric: LLD_V1,
  document: design({ entities: [entity("lot"), entity("spot")] }),
  kind: "INITIAL",
  changeTestResponse: null,
};

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    criterionId: "responsibility-clarity",
    level: "L2",
    headline: "Each class states one job",
    evidenceEntityIds: ["lot"],
    concern: "",
    suggestion: "",
    confidence: "HIGH",
    ...overrides,
  };
}

describe("LlmRubricEvaluator", () => {
  it("sits out when no API key is configured", () => {
    const evaluator = new LlmRubricEvaluator(new FakeLlm([], false));
    expect(evaluator.supports(context)).toBe(false);
  });

  it("sits out the change-test round, which is scored deterministically", () => {
    const evaluator = new LlmRubricEvaluator(new FakeLlm([]));
    expect(evaluator.supports({ ...context, kind: "CHANGE_TEST" })).toBe(false);
  });

  it("passes the rubric's own descriptors through so the model picks between anchors", async () => {
    const llm = new FakeLlm([{ assessments: [assessment()] }]);
    await new LlmRubricEvaluator(llm).evaluate(context);

    const prompt = llm.calls[0]!.prompt;
    expect(prompt).toContain("Every class states a responsibility and no class owns more than one reason to change");
    expect(llm.calls[0]!.system).toContain("There is no reference solution");
  });

  it("only offers the model criteria the rubric hands to a model", async () => {
    const llm = new FakeLlm([{ assessments: [assessment()] }]);
    await new LlmRubricEvaluator(llm).evaluate(context);

    const schema = JSON.stringify(llm.calls[0]!.schema);
    expect(schema).toContain("responsibility-clarity");
    // Requirement coverage is arithmetic; a model must not get a vote on it.
    expect(schema).not.toContain("requirement-coverage");
  });

  it("drops an assessment for a criterion that does not exist", async () => {
    const llm = new FakeLlm([
      { assessments: [assessment(), assessment({ criterionId: "vibes", level: "L3" })] },
    ]);
    const { findings } = await new LlmRubricEvaluator(llm).evaluate(context);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.criterionId).toBe("responsibility-clarity");
  });

  it("drops an assessment whose level is not on the scale", async () => {
    const llm = new FakeLlm([
      { assessments: [assessment(), assessment({ criterionId: "abstraction", level: 7 })] },
    ]);
    const { findings } = await new LlmRubricEvaluator(llm).evaluate(context);
    expect(findings).toHaveLength(1);
  });

  it("strips evidence pointing at a class the learner never wrote", async () => {
    // The PaymentProcessor case: schema constraints guarantee the shape of the
    // answer, never the truth of it.
    const llm = new FakeLlm([
      { assessments: [assessment({ evidenceEntityIds: ["lot", "payment-processor"] })] },
    ]);
    const { findings } = await new LlmRubricEvaluator(llm).evaluate(context);
    expect(findings[0]!.evidence).toEqual([{ kind: "ENTITY", id: "lot" }]);
  });

  it("keeps the first verdict when the model answers the same criterion twice", async () => {
    const llm = new FakeLlm([
      { assessments: [assessment({ level: "L3" }), assessment({ level: "L0" })] },
    ]);
    const { findings } = await new LlmRubricEvaluator(llm).evaluate(context);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe("L3");
  });

  it("retries once, then succeeds", async () => {
    const llm = new FakeLlm([new Error("overloaded"), { assessments: [assessment()] }]);
    const { findings } = await new LlmRubricEvaluator(llm).evaluate(context);
    expect(llm.calls).toHaveLength(2);
    expect(findings).toHaveLength(1);
  });

  it("gives up after the second failure rather than burning credit", async () => {
    const llm = new FakeLlm([new Error("overloaded"), new Error("overloaded")]);
    await expect(new LlmRubricEvaluator(llm).evaluate(context)).rejects.toThrow("overloaded");
    expect(llm.calls).toHaveLength(2);
  });

  it("fails loudly when nothing in the response survives validation", async () => {
    // Better a degraded report that says the rubric review is missing than a
    // silent zero the learner reads as a judgement.
    const llm = new FakeLlm([{ assessments: "not an array" }]);
    await expect(new LlmRubricEvaluator(llm).evaluate(context)).rejects.toThrow(/no usable assessments/);
  });

  it("survives a response that is not an object at all", async () => {
    const llm = new FakeLlm([null]);
    await expect(new LlmRubricEvaluator(llm).evaluate(context)).rejects.toThrow(/no usable assessments/);
  });
});
