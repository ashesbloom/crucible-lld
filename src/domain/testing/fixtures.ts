/** Builders for tests. Kept minimal: enough to make a case readable, no framework. */

import { DesignDocument, type Entity, type Relation, type Decision } from "../design/DesignDocument";
import { Problem, type ChangeTestSpec, type Seam } from "../problem/Problem";

export function entity(id: string, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    stereotype: "ENTITY",
    responsibility: `Owns everything about ${id}.`,
    attributes: [],
    methods: [],
    ...overrides,
  };
}

export function relation(fromId: string, toId: string, kind: Relation["kind"] = "USES"): Relation {
  return { fromId, toId, kind };
}

export function decision(title: string, overrides: Partial<Decision> = {}): Decision {
  return {
    title,
    rationale: "Because it keeps the change local.",
    alternativeRejected: "A switch statement inside the caller.",
    ...overrides,
  };
}

export function design(input: {
  entities?: Entity[];
  relations?: Relation[];
  decisions?: Decision[];
  assumptions?: string[];
} = {}): DesignDocument {
  return DesignDocument.create(input);
}

export const pricingSeam: Seam = {
  id: "pricing",
  label: "Pricing",
  keywords: ["price", "pricing", "fee", "rate", "charge"],
  satisfyingStereotypes: ["STRATEGY", "INTERFACE"],
  explanation: "Pricing was computed inline, so a new rate means editing existing classes.",
};

export function changeTest(overrides: Partial<ChangeTestSpec> = {}): ChangeTestSpec {
  return {
    requirement: "Support electric vehicle bays billed per minute.",
    framing: "A new requirement lands.",
    expectedSeams: [pricingSeam],
    parBlastRadius: 0.3,
    ...overrides,
  };
}

export function problem(overrides: Partial<ConstructorParameters<typeof Problem>[0]> = {}): Problem {
  return new Problem({
    id: "p1",
    slug: "parking-lot",
    title: "Parking Lot",
    difficulty: "CORE",
    summary: "Model a multi-level parking lot.",
    statement: "Design a parking lot.",
    requirements: ["Vehicles park in spots", "Tickets are issued on entry"],
    constraints: [],
    conceptsProbed: [],
    rubricId: "lld-v1",
    changeTest: changeTest(),
    estimatedMinutes: 30,
    ...overrides,
  });
}
