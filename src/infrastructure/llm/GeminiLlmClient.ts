/**
 * The Gemini adapter.
 *
 * This file exists to be unremarkable. `LlmClient` is a port the domain owns,
 * so a second provider is a new file and one line in the composition root, and
 * nothing in the evaluators, the rubric, the pipeline or the UI learns that a
 * different company's model is answering. That claim is easy to make about an
 * interface and cheap to check about a real one, which is the point of writing
 * the second implementation rather than describing it.
 *
 * Two things differ from the Anthropic adapter, and both are worth naming.
 *
 * Anthropic guarantees shape by forcing a tool call with a declared input
 * schema. Gemini has no equivalent here, but it constrains the response body
 * directly: `responseJsonSchema` plus a JSON mime type means the text that
 * comes back is generated against the schema rather than merely encouraged
 * toward it. Different mechanism, same property, which is why the port asks
 * for a schema instead of asking for a tool.
 *
 * The field order in those schemas is load-bearing. The rubric schema puts
 * `level` before `headline` so the model commits to a level before it writes
 * the prose that could talk it into a different one. Anthropic follows the
 * order of the schema it is given; Gemini wants that stated as
 * `propertyOrdering`, so this adapter derives it rather than letting a
 * deliberate decision quietly stop applying on one provider.
 */

import { GoogleGenAI } from "@google/genai";
import type { LlmClient, StructuredRequest } from "@/domain/ports/index";

/**
 * Overridable because model names move faster than deploys do. A name that has
 * been retired should cost an environment variable, not a code change.
 */
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

/**
 * Copies the schema with `propertyOrdering` added to every object node, taken
 * from the order the properties were written in. Copies rather than mutates:
 * one of the callers passes a module-level constant, and writing to that would
 * be a bug that only shows up on the second request.
 */
export function withPropertyOrdering(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withPropertyOrdering);
  if (schema === null || typeof schema !== "object") return schema;

  const source = schema as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    copy[key] = withPropertyOrdering(value);
  }

  const properties = source.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    copy.propertyOrdering = Object.keys(properties as Record<string, unknown>);
  }

  return copy;
}

export class GeminiLlmClient implements LlmClient {
  readonly id = MODEL;
  readonly available: boolean;
  readonly #client: GoogleGenAI | null;

  constructor(apiKey: string | undefined = process.env.GEMINI_API_KEY) {
    const key = apiKey?.trim();
    this.available = Boolean(key);
    this.#client = key
      ? new GoogleGenAI({
          apiKey: key,
          // The SDK can retry 408, 429 and 5xx with exponential backoff, but
          // only if this object exists: the request path returns early on
          // `!retryOptions` before it looks at the status. Omitting it means a
          // 503 saying "high demand, try again later" is not tried again, which
          // is the first thing this model actually did. The Anthropic SDK
          // retries twice on its own, so without this the two adapters behave
          // differently for the layers that are supposed to be unable to tell
          // them apart.
          //
          // The defaults are 5 attempts backing off to 60 seconds, which is far
          // past the request the evaluation is running inside. Three attempts
          // spend at most about three and a half seconds sleeping and still
          // cover a brief spike. Anything longer is the queue's problem, and
          // the pipeline already degrades instead of failing whole.
          httpOptions: { retryOptions: { attempts: 3, initialDelay: 0.5, maxDelay: 4 } },
        })
      : null;
  }

  async requestStructured(request: StructuredRequest): Promise<unknown> {
    if (!this.#client) throw new Error("No GEMINI_API_KEY configured.");

    const response = await this.#client.models.generateContent({
      model: MODEL,
      contents: request.prompt,
      config: {
        systemInstruction: request.system,
        // Pinned to zero for the same reason as the other adapter: two runs of
        // the same submission that disagree make an attempt history worthless.
        temperature: 0,
        maxOutputTokens: request.maxTokens ?? 2048,
        responseMimeType: "application/json",
        responseJsonSchema: withPropertyOrdering(request.schema),
      },
    });

    // Undefined rather than empty when a safety filter or a token ceiling stops
    // the response, so this is a real branch and not defensive noise.
    const text = response.text;
    if (!text) {
      throw new Error(`${MODEL} returned no content, so there is nothing to read.`);
    }

    try {
      // Schema-constrained, so this parse is not the hopeful one the first
      // version of the Anthropic adapter did on free prose. It is still the far
      // side of a network boundary, so a failure says what arrived.
      return JSON.parse(text);
    } catch {
      throw new Error(`${MODEL} returned text that is not JSON: ${text.slice(0, 200)}`);
    }
  }
}
