import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import { worker } from "@/application/EvaluationWorker";
import type { DesignDocumentInput } from "@/domain/design/DesignDocument";
import { handle, idempotencyKey } from "@/lib/api";

/**
 * Accepts the design and returns immediately.
 *
 * The response is a 202 with an evaluation id, never a report. Evaluation can
 * take ten seconds against a model, and blocking the request on it would mean a
 * timeout loses work the learner has already done.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as DesignDocumentInput;

    const result = await new PracticeService().submitDesign(
      id,
      body,
      idempotencyKey(request, `submit:${id}`),
    );

    // Not awaited. The work is already durable; this just starts it sooner than
    // the first status poll would.
    worker.kick();

    return NextResponse.json(result, { status: result.deduplicated ? 200 : 202 });
  } catch (error) {
    return handle(error);
  }
}
