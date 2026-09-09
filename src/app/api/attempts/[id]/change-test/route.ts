import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import { worker } from "@/application/EvaluationWorker";
import type { ChangeTestResponse } from "@/domain/evaluation/BlastRadius";
import { handle, idempotencyKey } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as ChangeTestResponse;

    const result = await new PracticeService().submitChangeTest(
      id,
      { impacts: body.impacts ?? [], newEntities: body.newEntities ?? [], narrative: body.narrative ?? "" },
      idempotencyKey(request, `change-test:${id}`),
    );

    worker.kick();
    return NextResponse.json(result, { status: result.deduplicated ? 200 : 202 });
  } catch (error) {
    return handle(error);
  }
}
