import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import { handle } from "@/lib/api";
import { LEARNER_ID } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const { problemSlug } = (await request.json()) as { problemSlug?: string };
    if (!problemSlug) {
      return NextResponse.json({ error: "problemSlug is required." }, { status: 400 });
    }

    const attempt = await new PracticeService().startAttempt(LEARNER_ID, problemSlug);
    return NextResponse.json({ attemptId: attempt.id, attemptNumber: attempt.attemptNumber }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}
