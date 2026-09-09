import { describe, expect, it } from "vitest";
import { Evaluation, IllegalTransitionError, MAX_ATTEMPTS } from "./Evaluation";
import type { FeedbackReport } from "./FeedbackReport";

const now = new Date("2026-09-09T10:00:00Z");
const report = { summary: "ok" } as unknown as FeedbackReport;

function queued() {
  return Evaluation.queue("e1", "s1", now);
}

describe("Evaluation lifecycle", () => {
  it("starts queued with no attempts recorded", () => {
    const evaluation = queued();
    expect(evaluation.status).toBe("QUEUED");
    expect(evaluation.attempts).toBe(0);
    expect(evaluation.isTerminal()).toBe(false);
  });

  it("counts an attempt when it starts running", () => {
    const evaluation = queued();
    evaluation.start(now);
    expect(evaluation.status).toBe("RUNNING");
    expect(evaluation.attempts).toBe(1);
  });

  it("refuses to complete before it has started", () => {
    // The bug this guards against: deriving status from `report != null` let a
    // report be attached to an evaluation that never ran.
    expect(() => queued().complete(report, now)).toThrow(IllegalTransitionError);
  });

  it("refuses to complete twice", () => {
    const evaluation = queued();
    evaluation.start(now);
    evaluation.complete(report, now);
    expect(() => evaluation.complete(report, now)).toThrow(IllegalTransitionError);
  });

  it("refuses to start an evaluation that is already running", () => {
    const evaluation = queued();
    evaluation.start(now);
    expect(() => evaluation.start(now)).toThrow(IllegalTransitionError);
  });

  it("refuses to record a stage unless it is running", () => {
    const evaluation = queued();
    expect(() =>
      evaluation.recordStage({ evaluatorId: "structure", label: "Structural checks", status: "OK" }),
    ).toThrow(IllegalTransitionError);
  });

  it("replaces a stage rather than appending it twice", () => {
    const evaluation = queued();
    evaluation.start(now);
    evaluation.recordStage({ evaluatorId: "structure", label: "Structural checks", status: "RUNNING" });
    evaluation.recordStage({ evaluatorId: "structure", label: "Structural checks", status: "OK" });
    expect(evaluation.stages).toHaveLength(1);
    expect(evaluation.stages[0]!.status).toBe("OK");
  });

  it("can retry a failure, and clears the stale stages when it does", () => {
    const evaluation = queued();
    evaluation.start(now);
    evaluation.recordStage({ evaluatorId: "llm-rubric", label: "Rubric review", status: "ERROR" });
    evaluation.fail("provider timed out", now);

    expect(evaluation.status).toBe("FAILED");
    expect(evaluation.canRetry()).toBe(true);

    evaluation.retry();
    expect(evaluation.status).toBe("QUEUED");
    expect(evaluation.stages).toHaveLength(0);
    expect(evaluation.attempts).toBe(1);
  });

  it("refuses to retry a successful evaluation", () => {
    const evaluation = queued();
    evaluation.start(now);
    evaluation.complete(report, now);
    expect(() => evaluation.retry()).toThrow(IllegalTransitionError);
  });

  it("stops retrying once the attempt cap is reached", () => {
    const evaluation = queued();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      evaluation.start(now);
      evaluation.fail("provider timed out", now);
      if (i < MAX_ATTEMPTS - 1) evaluation.retry();
    }
    expect(evaluation.attempts).toBe(MAX_ATTEMPTS);
    expect(evaluation.canRetry()).toBe(false);
    expect(() => evaluation.retry()).toThrow(/all 3 attempts/);
  });

  it("survives a round trip through its snapshot", () => {
    const evaluation = queued();
    evaluation.start(now);
    evaluation.fail("boom", now);

    const restored = Evaluation.rehydrate(evaluation.toSnapshot());
    expect(restored.status).toBe("FAILED");
    expect(restored.attempts).toBe(1);
    expect(restored.error).toBe("boom");
    expect(restored.canRetry()).toBe(true);
  });
});
