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

export function createLlmClient(): LlmClient {
  const client = new AnthropicLlmClient();
  return client.available ? client : new UnavailableLlmClient();
}
