import { describe, expect, it } from "vitest";
import { toMermaid } from "./MermaidEmitter";
import type { ImpactVerdict } from "../evaluation/BlastRadius";
import { design, entity, relation } from "../testing/fixtures";

describe("Mermaid emitter", () => {
  it("renders a placeholder rather than invalid syntax for an empty design", () => {
    expect(toMermaid(design())).toContain("classDiagram");
  });

  it("declares one class per entity with its stereotype", () => {
    const out = toMermaid(
      design({ entities: [entity("p", { name: "PricingStrategy", stereotype: "STRATEGY" })] }),
    );
    expect(out).toContain('class p["PricingStrategy"]');
    expect(out).toContain("<<strategy>>");
  });

  it("makes ids safe for Mermaid without losing the readable name", () => {
    const out = toMermaid(design({ entities: [entity("a-b:c", { name: "Ticket" })] }));
    expect(out).toContain('class a_b_c["Ticket"]');
    expect(out).not.toMatch(/class a-b:c/);
  });

  it("draws inheritance parent-first and usage child-first", () => {
    const out = toMermaid(
      design({
        entities: [entity("car"), entity("vehicle"), entity("lot")],
        relations: [relation("car", "vehicle", "IS_A"), relation("lot", "car", "USES")],
      }),
    );
    expect(out).toContain("vehicle <|-- car");
    expect(out).toContain("lot --> car");
  });

  it("skips relationships whose endpoints are missing rather than emitting broken syntax", () => {
    const out = toMermaid(design({ entities: [entity("a")], relations: [relation("a", "ghost")] }));
    expect(out).not.toContain("ghost");
  });

  it("colours classes by change-test impact", () => {
    const impacts = new Map<string, ImpactVerdict>([["a", "MODIFIED"], ["b", "UNCHANGED"]]);
    const out = toMermaid(design({ entities: [entity("a"), entity("b")] }), { impacts });
    expect(out).toContain('cssClass "a" modified');
    expect(out).toContain('cssClass "b" unchanged');
  });

  it("ignores a highlight for a class that is not in the diagram", () => {
    const out = toMermaid(design({ entities: [entity("a")] }), { highlighted: new Set(["ghost"]) });
    expect(out).not.toContain("ghost");
  });

  it("strips characters that would break a Mermaid label", () => {
    const out = toMermaid(design({ entities: [entity("a", { name: 'Ticket "the" {one}' })] }));
    expect(out).toContain('class a["Ticket the one"]');
  });
});
