import { describe, expect, it } from "vitest";
import { StructureEvaluator } from "./StructureEvaluator";
import type { EvaluationContext } from "../evaluation/Evaluator";
import { LLD_V1 } from "../rubric/rubrics/lldV1";
import { design, entity, problem, relation } from "../testing/fixtures";
import type { DesignDocument } from "../design/DesignDocument";

const evaluator = new StructureEvaluator();

function context(document: DesignDocument, requirements?: string[]): EvaluationContext {
  return {
    problem: problem(requirements ? { requirements } : {}),
    rubric: LLD_V1,
    document,
    kind: "INITIAL",
    changeTestResponse: null,
  };
}

async function findingsFor(document: DesignDocument, requirements?: string[]) {
  const { findings } = await evaluator.evaluate(context(document, requirements));
  return findings;
}

describe("StructureEvaluator", () => {
  it("flags a class that states no responsibility", async () => {
    const findings = await findingsFor(
      design({ entities: [entity("a"), entity("b", { responsibility: "  " })] }),
    );
    const found = findings.find((f) => f.headline.includes("state no responsibility"));
    expect(found).toBeDefined();
    expect(found!.evidence).toEqual([{ kind: "ENTITY", id: "b" }]);
  });

  it("flags a class carrying too many methods", async () => {
    const findings = await findingsFor(
      design({
        entities: [entity("god", { name: "ParkingLot", methods: Array.from({ length: 12 }, (_, i) => `op${i}()`) })],
      }),
    );
    expect(findings.some((f) => f.headline.includes("more than 8 methods"))).toBe(true);
  });

  it("flags a class nothing connects to", async () => {
    const findings = await findingsFor(
      design({
        entities: [entity("a"), entity("b"), entity("lonely")],
        relations: [relation("a", "b")],
      }),
    );
    const found = findings.find((f) => f.headline.includes("connect"));
    expect(found!.evidence).toEqual([{ kind: "ENTITY", id: "lonely" }]);
  });

  it("flags a relationship pointing at a class that does not exist", async () => {
    const findings = await findingsFor(
      design({ entities: [entity("a")], relations: [relation("a", "ghost")] }),
    );
    expect(findings.some((f) => f.headline.includes("does not exist"))).toBe(true);
  });

  it("flags a design of four or more classes with no abstraction at all", async () => {
    const findings = await findingsFor(
      design({ entities: ["a", "b", "c", "d"].map((id) => entity(id)) }),
    );
    expect(findings.some((f) => f.headline.includes("No interfaces"))).toBe(true);
  });

  it("does not demand abstraction from a three-class design", async () => {
    const findings = await findingsFor(design({ entities: ["a", "b", "c"].map((id) => entity(id)) }));
    expect(findings.some((f) => f.headline.includes("No interfaces"))).toBe(false);
  });

  it("scores requirement coverage from what the design actually mentions", async () => {
    const covered = await findingsFor(
      design({
        entities: [
          entity("ticket", { name: "Ticket", responsibility: "Issued to a vehicle on entry." }),
          entity("spot", { name: "Spot", responsibility: "A place a vehicle parks." }),
        ],
        assumptions: ["One vehicle per spot"],
      }),
      ["Vehicles park in spots", "Tickets are issued on entry"],
    );
    const coverage = covered.find((f) => f.criterionId === "requirement-coverage")!;
    expect(coverage.level).toBe("L3");
    expect(coverage.evidence).toHaveLength(0);
  });

  it("caps coverage at L2 when no assumptions were recorded", async () => {
    const findings = await findingsFor(
      design({
        entities: [
          entity("ticket", { name: "Ticket", responsibility: "Issued to a vehicle on entry." }),
          entity("spot", { name: "Spot", responsibility: "A place a vehicle parks." }),
        ],
      }),
      ["Vehicles park in spots", "Tickets are issued on entry"],
    );
    expect(findings.find((f) => f.criterionId === "requirement-coverage")!.level).toBe("L2");
  });

  it("points at the requirements that have no home in the design", async () => {
    const findings = await findingsFor(
      design({ entities: [entity("x", { name: "Widget", responsibility: "Does nothing useful." })] }),
      ["Vehicles park in spots", "Tickets are issued on entry", "Payments are settled on exit"],
    );
    const coverage = findings.find((f) => f.criterionId === "requirement-coverage")!;
    expect(coverage.level).toBe("L0");
    expect(coverage.evidence).toHaveLength(3);
  });

  it("always runs, even on an empty design", async () => {
    expect(evaluator.supports()).toBe(true);
    await expect(findingsFor(design())).resolves.toBeDefined();
  });
});
