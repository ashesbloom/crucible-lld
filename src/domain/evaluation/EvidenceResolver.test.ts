import { describe, expect, it } from "vitest";
import { EvidenceResolver } from "./EvidenceResolver";
import type { Finding } from "./Finding";
import { decision, design, entity } from "../testing/fixtures";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    criterionId: "responsibility-clarity",
    level: "L1",
    source: "LLM",
    evaluatorId: "llm-rubric",
    headline: "Something is wrong",
    evidence: [],
    concern: "",
    suggestion: "",
    confidence: "MEDIUM",
    ...overrides,
  };
}

const document = design({
  entities: [entity("ticket"), entity("spot")],
  decisions: [decision("Ticket owns its own expiry")],
  assumptions: ["One vehicle per spot"],
});

const resolver = new EvidenceResolver(document, 3);

describe("EvidenceResolver", () => {
  it("keeps a finding whose evidence all resolves", () => {
    const result = resolver.resolve([finding({ evidence: [{ kind: "ENTITY", id: "ticket" }] })]);
    expect(result.kept).toHaveLength(1);
    expect(result.discarded).toHaveLength(0);
  });

  it("discards a finding about a class the learner never wrote", () => {
    // The real failure: the model criticised a PaymentProcessor in a submission
    // that had no such class. A prompt asking it not to reduced this; only a
    // validator stopped it.
    const result = resolver.resolve([
      finding({ evidence: [{ kind: "ENTITY", id: "payment-processor" }] }),
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.discarded).toHaveLength(1);
  });

  it("keeps a partly-grounded finding but strips the invented references", () => {
    const result = resolver.resolve([
      finding({
        evidence: [
          { kind: "ENTITY", id: "ticket" },
          { kind: "ENTITY", id: "does-not-exist" },
        ],
      }),
    ]);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.evidence).toEqual([{ kind: "ENTITY", id: "ticket" }]);
    expect(result.strippedRefs).toBe(1);
  });

  it("keeps a finding that claims no evidence at all", () => {
    // Deterministic findings are often about absence: "no interfaces anywhere"
    // has nothing to point at and is still true.
    const result = resolver.resolve([finding({ source: "DETERMINISTIC", evidence: [] })]);
    expect(result.kept).toHaveLength(1);
  });

  it("checks index-based references against the real collection lengths", () => {
    const result = resolver.resolve([
      finding({ evidence: [{ kind: "DECISION", index: 0 }] }),
      finding({ evidence: [{ kind: "DECISION", index: 9 }] }),
      finding({ evidence: [{ kind: "REQUIREMENT", index: 2 }] }),
      finding({ evidence: [{ kind: "REQUIREMENT", index: 3 }] }),
      finding({ evidence: [{ kind: "ASSUMPTION", index: -1 }] }),
    ]);
    expect(result.kept).toHaveLength(2);
    expect(result.discarded).toHaveLength(3);
  });

  it("does not mutate the finding it was given", () => {
    const original = finding({
      evidence: [{ kind: "ENTITY", id: "ticket" }, { kind: "ENTITY", id: "ghost" }],
    });
    resolver.resolve([original]);
    expect(original.evidence).toHaveLength(2);
  });
});
