import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import { handle } from "@/lib/api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attempt = await new PracticeService().revealChangeTest(id);
    return NextResponse.json({ status: attempt.status });
  } catch (error) {
    return handle(error);
  }
}
