/**
 * @vitest-environment jsdom
 *
 * Does Mermaid actually accept what the emitter produces?
 *
 * The unit tests next door assert the emitter writes the lines we intended.
 * That is not the same question. The change-test screen depends on Mermaid
 * accepting `cssClass` inside a classDiagram, and a diagram that silently fails
 * to parse takes the product's headline visual with it. This runs the real
 * parser over real emitter output.
 */

import { describe, expect, it } from "vitest";
import { toMermaid } from "./MermaidEmitter";
import type { ImpactVerdict } from "../evaluation/BlastRadius";
import { DesignDocument } from "./DesignDocument";

const design = DesignDocument.create({
  entities: [
    { id: "lot", name: "ParkingLot", stereotype: "ENTITY", responsibility: "Allocates spots.", attributes: ["levels"], methods: ["park()", "release()"] },
    { id: "pricing", name: "PricingStrategy", stereotype: "INTERFACE", responsibility: "Prices a stay.", attributes: [], methods: ["feeFor()"] },
    { id: "hourly", name: "HourlyPricing", stereotype: "STRATEGY", responsibility: "Flat rate.", attributes: [], methods: ["feeFor()"] },
    { id: "odd-id:2", name: 'Ticket "the" {one}', stereotype: "VALUE_OBJECT", responsibility: "Entry record.", attributes: [], methods: [] },
  ],
  relations: [
    { fromId: "lot", toId: "pricing", kind: "USES" },
    { fromId: "hourly", toId: "pricing", kind: "IMPLEMENTS" },
    { fromId: "lot", toId: "odd-id:2", kind: "HAS_A", label: "issues" },
  ],
});

async function parser() {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  return mermaid;
}

describe("the emitter's output is valid Mermaid", () => {
  it("parses a plain diagram, including ids and labels that needed escaping", async () => {
    const mermaid = await parser();
    await expect(mermaid.parse(toMermaid(design))).resolves.toBeTruthy();
  });

  it("parses the impact colouring the change test depends on", async () => {
    // cssClass is state-diagram syntax in some Mermaid docs. It is in the
    // classDiagram lexer too, and this is the test that says so.
    const impacts = new Map<string, ImpactVerdict>([
      ["lot", "MODIFIED"],
      ["pricing", "UNCHANGED"],
      ["hourly", "UNCHANGED"],
      ["odd-id:2", "NEW"],
    ]);

    const source = toMermaid(design, { impacts });
    expect(source).toContain('cssClass "lot" modified');
    // safeId only prefixes when the cleaned id does not start with a letter.
    expect(source).toContain(String.raw`cssClass "odd_id_2" new`);

    const mermaid = await parser();
    await expect(mermaid.parse(source)).resolves.toBeTruthy();
  });

  it("parses the highlight used by the report's evidence chips", async () => {
    const mermaid = await parser();
    const source = toMermaid(design, { highlighted: new Set(["pricing"]) });
    await expect(mermaid.parse(source)).resolves.toBeTruthy();
  });

  it("parses the empty-design placeholder", async () => {
    const mermaid = await parser();
    await expect(mermaid.parse(toMermaid(DesignDocument.empty()))).resolves.toBeTruthy();
  });
});
