/**
 * End-to-end through the real repositories against an in-memory SQLite.
 *
 * The unit tests cover the rules; this covers the wiring, which is where the
 * failures that actually reach a learner live: an idempotency key that does not
 * stop a double submit, a report that never gets written back, a change test
 * that scores the wrong document.
 */

process.env.DATABASE_URL = ":memory:";
delete process.env.ANTHROPIC_API_KEY;

import { beforeAll, describe, expect, it } from "vitest";
import { PracticeService } from "./PracticeService";
import { EvaluationWorker } from "./EvaluationWorker";
import { container } from "./container";
import { ready } from "@/infrastructure/db/client";
import type { DesignDocumentInput } from "@/domain/design/DesignDocument";

const c = container();
const service = new PracticeService(c);
const worker = new EvaluationWorker(c);

const wellFactored: DesignDocumentInput = {
  assumptions: ["One vehicle per spot", "A single site"],
  entities: [
    { id: "lot", name: "ParkingLot", stereotype: "ENTITY", responsibility: "Knows which spots exist and which are free.", attributes: ["levels"], methods: ["allocate(vehicle)", "release(spot)"] },
    { id: "spot", name: "Spot", stereotype: "ENTITY", responsibility: "A single place one vehicle can park.", attributes: ["size", "occupied"], methods: ["fits(vehicle)"] },
    { id: "ticket", name: "Ticket", stereotype: "ENTITY", responsibility: "Records the spot and the time a vehicle entered.", attributes: ["issuedAt", "spotId"], methods: ["durationAt(time)"] },
    { id: "vehicle", name: "Vehicle", stereotype: "ENTITY", responsibility: "The thing being parked, and its size.", attributes: ["size"], methods: [] },
    { id: "pricing", name: "PricingStrategy", stereotype: "STRATEGY", responsibility: "Computes the fee for a completed stay.", attributes: [], methods: ["feeFor(ticket)"] },
    { id: "hourly", name: "HourlyPricing", stereotype: "STRATEGY", responsibility: "Charges a flat rate per started hour.", attributes: ["ratePerHour"], methods: ["feeFor(ticket)"] },
  ],
  relations: [
    { fromId: "lot", toId: "spot", kind: "HAS_A" },
    { fromId: "spot", toId: "vehicle", kind: "USES" },
    { fromId: "ticket", toId: "spot", kind: "USES" },
    { fromId: "hourly", toId: "pricing", kind: "IMPLEMENTS" },
    { fromId: "lot", toId: "pricing", kind: "USES" },
  ],
  decisions: [
    {
      title: "Fee calculation lives behind PricingStrategy",
      rationale: "Pricing is the rule most likely to change, so it should not be inside ParkingLot. We can add a rate without touching allocation.",
      alternativeRejected: "A switch on vehicle size inside ParkingLot.calculateFee.",
    },
  ],
};

async function submitAndEvaluate(attemptId: string, key: string) {
  const result = await service.submitDesign(attemptId, wellFactored, key);
  await worker.pump();
  return result;
}

beforeAll(async () => {
  await ready();
});

describe("the practice loop, end to end", () => {
  it("runs from problem selection through to a scored change test", async () => {
    const attempt = await service.startAttempt("learner-1", "parking-lot");
    expect(attempt.status).toBe("DRAFTING");
    expect(attempt.attemptNumber).toBe(1);

    const { evaluationId } = await submitAndEvaluate(attempt.id, "key-loop-1");

    const evaluation = await service.evaluation(evaluationId);
    expect(evaluation.status).toBe("COMPLETED");
    expect(evaluation.report).not.toBeNull();
    expect(evaluation.report!.score.overall).toBeGreaterThan(0);
    // No API key in this run, so the fallback must have carried the judgement criteria.
    expect(evaluation.report!.score.criteria.find((x) => x.criterionId === "responsibility-clarity")!.scoredBy)
      .toBe("HEURISTIC");

    const revealed = await service.revealChangeTest(attempt.id);
    expect(revealed.status).toBe("CHANGE_TEST");

    const changeTest = await service.submitChangeTest(
      attempt.id,
      {
        narrative: "Per-minute charging is another pricing rule, and an EV bay is another kind of spot.",
        impacts: [
          { entityId: "lot", verdict: "UNCHANGED", rationale: "Allocation does not care why a spot fits." },
          { entityId: "spot", verdict: "MODIFIED", rationale: "Needs to know it has a charger." },
          { entityId: "ticket", verdict: "UNCHANGED", rationale: "Still just records entry." },
          { entityId: "vehicle", verdict: "UNCHANGED", rationale: "EV is a size plus a flag." },
          { entityId: "pricing", verdict: "UNCHANGED", rationale: "The interface already covers it." },
          { entityId: "hourly", verdict: "UNCHANGED", rationale: "Untouched." },
        ],
        newEntities: [
          { id: "evPricing", name: "PerMinuteChargingPricing", stereotype: "STRATEGY", responsibility: "Charges per minute of charging on top of parking.", attributes: [], methods: ["feeFor(ticket)"] },
        ],
      },
      "key-loop-2",
    );

    await worker.pump();

    const second = await service.evaluation(changeTest.evaluationId);
    expect(second.status).toBe("COMPLETED");

    const blast = second.report!.blastRadius!;
    expect(blast.newCount).toBe(1);
    expect(blast.modifiedCount).toBe(1);
    expect(blast.radius).toBeCloseTo(2 / 7);
    expect(blast.band).toBe("CONTAINED");
    expect(blast.seams.find((s) => s.seam.id === "pricing")!.satisfied).toBe(true);

    const completed = await service.requireAttempt(attempt.id);
    expect(completed.status).toBe("COMPLETE");
    expect(completed.submissions).toHaveLength(2);
  });

  it("treats a repeated submit as the same submit", async () => {
    // A double-clicked button must not produce two evaluations or spend two API calls.
    const attempt = await service.startAttempt("learner-2", "parking-lot");

    const first = await service.submitDesign(attempt.id, wellFactored, "shared-key");
    const second = await service.submitDesign(attempt.id, wellFactored, "shared-key");

    expect(second.deduplicated).toBe(true);
    expect(second.evaluationId).toBe(first.evaluationId);
    expect(second.submissionId).toBe(first.submissionId);

    const reloaded = await service.requireAttempt(attempt.id);
    expect(reloaded.submissions).toHaveLength(1);
  });

  it("scopes an idempotency key to its attempt", async () => {
    // Found by testing: an unscoped key meant a client reusing "submit-1" on a
    // second attempt silently received the first attempt's report.
    const first = await service.startAttempt("learner-scope", "parking-lot");
    const second = await service.startAttempt("learner-scope", "elevator-system");

    const a = await service.submitDesign(first.id, wellFactored, "same-key");
    const b = await service.submitDesign(second.id, wellFactored, "same-key");

    expect(b.deduplicated).toBe(false);
    expect(b.evaluationId).not.toBe(a.evaluationId);
    expect(b.submissionId).not.toBe(a.submissionId);
  });

  it("numbers repeat attempts at the same problem so history means something", async () => {
    await service.startAttempt("learner-3", "elevator-system");
    const second = await service.startAttempt("learner-3", "elevator-system");
    expect(second.attemptNumber).toBe(2);
  });

  it("keeps attempts and their reports readable back out of the database", async () => {
    const attempt = await service.startAttempt("learner-4", "vending-machine");
    await submitAndEvaluate(attempt.id, "key-history");

    const history = await service.history("learner-4");
    expect(history).toHaveLength(1);
    expect(history[0]!.submissions[0]!.document.entityCount).toBe(6);
    expect(history[0]!.submissions[0]!.document.decisions[0]!.alternativeRejected).toContain("switch");
  });

  it("refuses to score a change test before the first one has been read", async () => {
    const attempt = await service.startAttempt("learner-5", "parking-lot");
    await service.submitDesign(attempt.id, wellFactored, "key-early");

    await expect(
      service.submitChangeTest(attempt.id, { impacts: [], newEntities: [], narrative: "" }, "key-early-2"),
    ).rejects.toThrow(/not open/);
  });

  it("reports a missing problem rather than throwing something unreadable", async () => {
    await expect(service.startAttempt("learner-6", "does-not-exist")).rejects.toThrow(/does not exist/);
  });
});
