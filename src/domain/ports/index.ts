/** Everything the domain needs from the outside world, expressed as interfaces it owns. */

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

/**
 * A request for structured output.
 *
 * The schema is not advisory. The Anthropic adapter turns it into a tool
 * definition so the model must return a matching object, which removed an
 * entire category of parsing failure: the first implementation called
 * `JSON.parse` on the raw text and broke the moment the model wrapped its
 * answer in a fenced code block.
 *
 * The return type is `unknown` on purpose. Schema-constrained output is much
 * better than free text but it is still the far side of a network boundary,
 * so callers validate before trusting.
 */
export interface StructuredRequest {
  readonly system: string;
  readonly prompt: string;
  readonly toolName: string;
  readonly toolDescription: string;
  readonly schema: Record<string, unknown>;
  readonly maxTokens?: number;
}

export interface LlmClient {
  readonly id: string;
  /** False when no API key is configured, which is a normal state, not an error. */
  readonly available: boolean;
  requestStructured(request: StructuredRequest): Promise<unknown>;
}

export class SystemClock implements Clock {
  now(): Date { return new Date(); }
}

export class FixedClock implements Clock {
  constructor(private readonly at: Date) {}
  now(): Date { return this.at; }
}

export class RandomIdGenerator implements IdGenerator {
  constructor(private readonly prefix = "") {}
  next(): string {
    return `${this.prefix}${crypto.randomUUID()}`;
  }
}
