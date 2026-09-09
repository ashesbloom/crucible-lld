import { NextResponse } from "next/server";
import { PracticeService } from "@/application/PracticeService";
import { seedDemoHistory, seedOpenDraft } from "@/infrastructure/seed/demoHistory";
import { handle } from "@/lib/api";
import { LEARNER_ID } from "@/lib/session";

/**
 * Fills the demo learner's history.
 *
 * A route rather than a script because it has to work on the deployed site
 * too, where nobody is going to run npm. It refuses when history already exists
 * so a second click cannot double the seed.
 */
export async function POST() {
  try {
    const service = new PracticeService();
    const existing = await service.history(LEARNER_ID);

    if (existing.length > 0) {
      return NextResponse.json({ seeded: 0, message: "History already has attempts in it." });
    }

    const seeded = await seedDemoHistory(LEARNER_ID);
    await seedOpenDraft(LEARNER_ID);
    return NextResponse.json({ seeded });
  } catch (error) {
    return handle(error);
  }
}
