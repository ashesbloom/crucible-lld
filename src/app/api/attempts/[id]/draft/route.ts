import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import type { DesignDocumentInput } from "@/domain/design/DesignDocument";
import { handle } from "@/lib/api";

/** Autosave. Cheap, frequent, and refused by the aggregate once submitted. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as DesignDocumentInput;
    await new PracticeService().saveDraft(id, body);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return handle(error);
  }
}
