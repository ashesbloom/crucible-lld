/**
 * Provider selection, which production got wrong in a way worth pinning down.
 *
 * Ranking providers by "has a key" picked an Anthropic key whose credit
 * balance was exhausted, so every rubric review came back 400 while a working
 * Gemini key sat behind it in the list. A key existing is not a key working,
 * and nothing reachable from here can tell the difference, so the deployment
 * has to be able to say which one it means.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createLlmClient } from "./AnthropicLlmClient";

const KEYS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function env(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("createLlmClient", () => {
  it("honours LLM_PROVIDER when both keys are present", () => {
    env({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", LLM_PROVIDER: "gemini" });
    expect(createLlmClient().id).toContain("gemini");

    env({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", LLM_PROVIDER: "anthropic" });
    expect(createLlmClient().id).toContain("claude");
  });

  it("ignores surrounding whitespace and casing in LLM_PROVIDER", () => {
    env({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", LLM_PROVIDER: "  GEMINI  " });
    expect(createLlmClient().id).toContain("gemini");
  });

  it("falls back to the first key present when LLM_PROVIDER is unset", () => {
    env({ GEMINI_API_KEY: "g" });
    expect(createLlmClient().id).toContain("gemini");

    env({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
    expect(createLlmClient().id).toContain("claude");
  });

  it("does not quietly substitute the other provider when the requested key is missing", () => {
    // The bug this guards against is the inverse of the production one: asking
    // for Gemini and silently being billed to Anthropic instead.
    env({ ANTHROPIC_API_KEY: "a", LLM_PROVIDER: "gemini" });

    const client = createLlmClient();
    expect(client.available).toBe(false);
    expect(client.id).toBe("unavailable");
  });

  it("rejects a provider name it does not have, naming the ones it does", () => {
    env({ ANTHROPIC_API_KEY: "a", LLM_PROVIDER: "openai" });
    expect(() => createLlmClient()).toThrow(/anthropic, gemini/);
  });

  it("reports unavailable rather than throwing when no key is configured", () => {
    env({});
    const client = createLlmClient();
    expect(client.available).toBe(false);
    expect(client.id).toBe("unavailable");
  });
});
