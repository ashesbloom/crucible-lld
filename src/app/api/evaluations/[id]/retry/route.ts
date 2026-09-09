import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import { worker } from "@/application/EvaluationWorker";
import { handle } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const evaluation = await new PracticeService().retryEvaluation(id);
    worker.kick();
    return NextResponse.json({ status: evaluation.status, attempts: evaluation.attempts });
  } catch (error) {
    return handle(error);
  }
}
