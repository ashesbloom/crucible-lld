import { NextResponse } from "next/server";
import { NotFoundError } from "@/application/PracticeService";
import { AttemptStateError } from "@/domain/attempt/Attempt";
import { InvalidDesignError } from "@/domain/design/DesignDocument";
import { IllegalTransitionError } from "@/domain/evaluation/Evaluation";

/**
 * One place that maps domain errors to status codes.
 *
 * The domain throws meaningful types rather than returning error objects, so
 * every route can just let them out and get a sensible response. A rule broken
 * by the caller is a 4xx; anything else is ours and is a 500.
 */
export function handle(error: unknown): NextResponse {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof AttemptStateError ||
    error instanceof InvalidDesignError ||
    error instanceof IllegalTransitionError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  console.error("[api]", error);
  return NextResponse.json({ error: "Something failed on our side." }, { status: 500 });
}

/** Idempotency keys come from the client so a retried request carries the original. */
export function idempotencyKey(request: Request, fallback: string): string {
  return request.headers.get("Idempotency-Key")?.slice(0, 200) || fallback;
}
