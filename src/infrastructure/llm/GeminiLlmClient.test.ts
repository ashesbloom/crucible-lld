/**
 * The rubric schema orders `level` before `headline` on purpose, so the model
 * picks a level before writing prose that could argue it into a different one.
 * Anthropic honours the order of the schema it is handed. Gemini wants it said
 * out loud, so the adapter derives it, and these tests are what stop that
 * derivation from silently drifting.
 */

import { describe, expect, it } from "vitest";
import { withPropertyOrdering } from "./GeminiLlmClient";

describe("withPropertyOrdering", () => {
  it("states the order the properties were written in", () => {
    const result = withPropertyOrdering({
      type: "object",
      properties: {
        criterionId: { type: "string" },
        level: { type: "string" },
        headline: { type: "string" },
      },
    }) as { propertyOrdering: string[] };

    expect(result.propertyOrdering).toEqual(["criterionId", "level", "headline"]);
  });

  it("reaches object nodes nested inside array items", () => {
    const result = withPropertyOrdering({
      type: "object",
      properties: {
        assessments: {
          type: "array",
          items: {
            type: "object",
            properties: { level: { type: "string" }, headline: { type: "string" } },
          },
        },
      },
    }) as { properties: { assessments: { items: { propertyOrdering: string[] } } } };

    expect(result.properties.assessments.items.propertyOrdering).toEqual(["level", "headline"]);
  });

  it("leaves the caller's schema untouched", () => {
    // BlastRadiusEvaluator holds its schema in a module-level constant, so a
    // mutating implementation would corrupt every request after the first.
    const original = {
      type: "object",
      properties: { contested: { type: "array" } },
    };
    const before = JSON.stringify(original);

    withPropertyOrdering(original);

    expect(JSON.stringify(original)).toBe(before);
    expect("propertyOrdering" in original).toBe(false);
  });

  it("adds nothing to nodes that declare no properties", () => {
    const result = withPropertyOrdering({ type: "string", enum: ["LOW", "HIGH"] }) as Record<string, unknown>;

    expect(result).toEqual({ type: "string", enum: ["LOW", "HIGH"] });
  });

  it("passes primitives and null straight through", () => {
    expect(withPropertyOrdering("string")).toBe("string");
    expect(withPropertyOrdering(7)).toBe(7);
    expect(withPropertyOrdering(null)).toBeNull();
  });
});
