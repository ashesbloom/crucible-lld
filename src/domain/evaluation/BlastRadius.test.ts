import { describe, expect, it } from "vitest";
import { checkSeams, computeBlastRadius, type ChangeTestResponse } from "./BlastRadius";
import { changeTest, design, entity, pricingSeam } from "../testing/fixtures";

const wellFactored = design({
  entities: [
    entity("lot"),
    entity("spot"),
    entity("ticket"),
    entity("vehicle"),
    entity("pricing", {
      name: "PricingStrategy",
      stereotype: "STRATEGY",
      responsibility: "Computes the fee for a completed stay.",
      methods: ["priceFor(ticket)"],
    }),
  ],
});

const inlined = design({
  entities: [entity("lot"), entity("spot"), entity("ticket"), entity("vehicle")],
});

function response(overrides: Partial<ChangeTestResponse> = {}): ChangeTestResponse {
  return { impacts: [], newEntities: [], narrative: "", ...overrides };
}

describe("seam checking", () => {
  it("finds a seam when a strategy speaks to the concern", () => {
    const [result] = checkSeams(wellFactored, [pricingSeam]);
    expect(result!.satisfied).toBe(true);
    expect(result!.matchedEntityName).toBe("PricingStrategy");
  });

  it("reports no seam when the concern has no home", () => {
    expect(checkSeams(inlined, [pricingSeam])[0]!.satisfied).toBe(false);
  });

  it("does not accept a plain entity as a seam even if it mentions the concern", () => {
    // A class called Pricing that is just data is not somewhere behaviour can vary.
    const dataOnly = design({
      entities: [entity("p", { name: "PricingTable", stereotype: "ENTITY", responsibility: "Holds prices." })],
    });
    expect(checkSeams(dataOnly, [pricingSeam])[0]!.satisfied).toBe(false);
  });
});

describe("blast radius", () => {
  it("scores a contained change highly when the seams were already there", () => {
    const result = computeBlastRadius(
      wellFactored,
      response({
        impacts: [
          { entityId: "lot", verdict: "UNCHANGED", rationale: "" },
          { entityId: "spot", verdict: "UNCHANGED", rationale: "" },
          { entityId: "ticket", verdict: "UNCHANGED", rationale: "" },
          { entityId: "vehicle", verdict: "UNCHANGED", rationale: "" },
          { entityId: "pricing", verdict: "UNCHANGED", rationale: "" },
        ],
        newEntities: [entity("evPricing", { name: "PerMinutePricing", stereotype: "STRATEGY" })],
      }),
      changeTest(),
    );

    expect(result.newCount).toBe(1);
    expect(result.modifiedCount).toBe(0);
    expect(result.radius).toBeCloseTo(1 / 6);
    expect(result.band).toBe("CONTAINED");
    expect(result.level).toBe("L3");
  });

  it("scores a wide change poorly", () => {
    const result = computeBlastRadius(
      inlined,
      response({
        impacts: inlined.entities.map((e) => ({ entityId: e.id, verdict: "MODIFIED" as const, rationale: "" })),
        newEntities: [],
      }),
      changeTest(),
    );

    expect(result.radius).toBe(1);
    expect(result.band).toBe("WIDE");
    expect(result.level).toBe("L0");
  });

  it("refuses to reward a learner who claims nothing changes", () => {
    // A radius of zero would otherwise read as a flawless design.
    const result = computeBlastRadius(
      wellFactored,
      response({
        impacts: wellFactored.entities.map((e) => ({ entityId: e.id, verdict: "UNCHANGED" as const, rationale: "" })),
      }),
      changeTest(),
    );

    expect(result.radius).toBe(0);
    expect(result.claimedNoChange).toBe(true);
    expect(result.level).toBe("L0");
  });

  it("ignores impact claims about classes that are not in the design", () => {
    const result = computeBlastRadius(
      inlined,
      response({
        impacts: [
          { entityId: "lot", verdict: "MODIFIED", rationale: "" },
          { entityId: "imaginary", verdict: "MODIFIED", rationale: "" },
        ],
      }),
      changeTest(),
    );
    expect(result.modifiedCount).toBe(1);
  });

  it("counts new classes toward the total, so adding ten is not free", () => {
    const many = Array.from({ length: 10 }, (_, i) => entity(`new${i}`));
    const result = computeBlastRadius(
      wellFactored,
      response({ newEntities: many }),
      changeTest(),
    );
    expect(result.radius).toBeCloseTo(10 / 15);
    expect(result.band).toBe("WIDE");
  });

  it("bands against the problem's own par rather than a fixed threshold", () => {
    // One of four classes modified: a radius of 0.25 either way.
    const impacts = [{ entityId: "lot", verdict: "MODIFIED" as const, rationale: "" }];
    const strict = computeBlastRadius(inlined, response({ impacts }), changeTest({ parBlastRadius: 0.1 }));
    const middling = computeBlastRadius(inlined, response({ impacts }), changeTest({ parBlastRadius: 0.2 }));
    const lenient = computeBlastRadius(inlined, response({ impacts }), changeTest({ parBlastRadius: 0.5 }));

    expect(strict.radius).toBe(0.25);
    expect(middling.radius).toBe(0.25);
    expect(lenient.radius).toBe(0.25);

    expect(strict.band).toBe("WIDE");
    expect(middling.band).toBe("MODERATE");
    expect(lenient.band).toBe("CONTAINED");
  });
});

describe("seam matching is structural", () => {
  it("does not count a class whose description merely mentions the concern", () => {
    // ParkingLot "allocates spots and applies the fee" is not a pricing seam.
    // Found while walking the real flow: prose matching made almost anything count.
    const prosey = design({
      entities: [
        entity("lot", {
          name: "ParkingLot",
          stereotype: "STRATEGY",
          responsibility: "Allocates spots and applies the parking fee on exit.",
          methods: ["allocate()"],
        }),
      ],
    });
    expect(checkSeams(prosey, [pricingSeam])[0]!.satisfied).toBe(false);
  });

  it("counts a class whose name or methods carry the concern", () => {
    const byMethod = design({
      entities: [entity("f", { name: "FeeRule", stereotype: "STRATEGY", responsibility: "", methods: ["chargeFor(stay)"] })],
    });
    expect(checkSeams(byMethod, [pricingSeam])[0]!.satisfied).toBe(true);
  });
});
