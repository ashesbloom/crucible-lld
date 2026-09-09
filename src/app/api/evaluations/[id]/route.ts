import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import { worker } from "@/application/EvaluationWorker";
import { handle } from "@/lib/api";

/**
 * What the poller reads.
 *
 * If it finds work still queued it starts the pump before answering. That is
 * what makes the system self-healing: an evaluation orphaned by a restarted dev
 * server is picked up by the next person who looks at it, rather than sitting
 * queued forever.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const evaluation = await new PracticeService().evaluation(id);

    if (evaluation.status === "QUEUED") worker.kick();

    return NextResponse.json({
      id: evaluation.id,
      status: evaluation.status,
      attempts: evaluation.attempts,
      stages: evaluation.stages,
      error: evaluation.error,
      canRetry: evaluation.canRetry(),
      report: evaluation.report,
    });
  } catch (error) {
    return handle(error);
  }
}
