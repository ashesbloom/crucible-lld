/**
 * The Anthropic adapter.
 *
 * The one decision worth pointing at: output comes back through a tool call
 * with a declared input schema, not as text we parse. The first version asked
 * for JSON in the prompt and called JSON.parse on the response, which worked
 * until the model wrapped its answer in a fenced code block, and then again
 * until it returned a numeric field as a string. Both are normal model
 * behaviour, and neither is fixable by asking more firmly.
 *
 * Temperature is pinned to zero. Design feedback that changes wording between
 * two runs of the same submission reads as noise, and an attempt history is
 * only worth keeping if the scores are comparable.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, StructuredRequest } from "@/domain/ports/index";
import { GeminiLlmClient } from "@/infrastructure/llm/GeminiLlmClient";

const MODEL = "claude-sonnet-5";

export class AnthropicLlmClient implements LlmClient {
  readonly id = MODEL;
  readonly available: boolean;
  readonly #client: Anthropic | null;

  constructor(apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {
    const key = apiKey?.trim();
    this.available = Boolean(key);
    this.#client = key ? new Anthropic({ apiKey: key }) : null;
  }

  async requestStructured(request: StructuredRequest): Promise<unknown> {
    if (!this.#client) throw new Error("No ANTHROPIC_API_KEY configured.");

    const response = await this.#client.messages.create({
      model: MODEL,
      max_tokens: request.maxTokens ?? 2048,
      temperature: 0,
      system: request.system,
      tools: [
        {
          name: request.toolName,
          description: request.toolDescription,
          input_schema: request.schema as Anthropic.Tool.InputSchema,
        },
      ],
      // Forcing the tool is what turns "please answer in JSON" into a
      // structural guarantee rather than a request.
      tool_choice: { type: "tool", name: request.toolName },
      messages: [{ role: "user", content: request.prompt }],
    });

    const call = response.content.find((block) => block.type === "tool_use");
    if (!call || call.type !== "tool_use") {
      throw new Error("The model replied without calling the tool it was given.");
    }

    // Still `unknown` to the caller. A guaranteed shape is not a guaranteed truth.
    return call.input;
  }
}

/** Used when no key is present, so the rest of the system needs no special case. */
export class UnavailableLlmClient implements LlmClient {
  readonly id = "unavailable";
  readonly available = false;
  async requestStructured(): Promise<unknown> {
    throw new Error("No LLM configured.");
  }
}

/**
 * Picks the provider. No key at all is a normal state rather than an error:
 * the heuristic evaluator covers the judged criteria and the loop still runs
 * end to end.
 *
 * `LLM_PROVIDER` exists because the first version of this ranked providers by
 * whether a key was present, and a key being present is not the same as a key
 * working. A leftover Anthropic key with an exhausted credit balance won the
 * ranking and answered every request with a 400, while a working Gemini key
 * sat unused behind it. `available` cannot see a billing state, so the choice
 * belongs to whoever configured the deployment rather than to a guess made
 * here.
 *
 * Unset keeps the old behaviour, which is right for the common case of exactly
 * one key. Set it when more than one is present and you mean a specific one.
 */
export function createLlmClient(): LlmClient {
  const clients: Record<string, () => LlmClient> = {
    anthropic: () => new AnthropicLlmClient(),
    gemini: () => new GeminiLlmClient(),
  };

  const requested = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (requested) {
    const build = clients[requested];
    if (!build) {
      throw new Error(
        `LLM_PROVIDER is "${requested}". It must be one of: ${Object.keys(clients).join(", ")}.`,
      );
    }
    // Deliberately not falling back to the other provider. Asking for one and
    // silently getting another is worse than being told the key is missing.
    const chosen = build();
    return chosen.available ? chosen : new UnavailableLlmClient();
  }

  return (
    Object.values(clients)
      .map((build) => build())
      .find((client) => client.available) ?? new UnavailableLlmClient()
  );
}
