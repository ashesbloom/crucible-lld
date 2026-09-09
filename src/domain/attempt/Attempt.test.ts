import { describe, expect, it } from "vitest";
import { Attempt, AttemptStateError } from "./Attempt";
import { design, entity } from "../testing/fixtures";

const now = new Date("2026-09-09T10:00:00Z");
const doc = design({ entities: [entity("lot"), entity("spot")] });

function drafting() {
  return Attempt.start("a1", "learner", "p1", 1, design(), now);
}

function submitted() {
  const attempt = drafting();
  attempt.submitInitial("s1", doc, "key-1", now);
  return attempt;
}

describe("Attempt", () => {
  it("starts in drafting with nothing submitted", () => {
    expect(drafting().status).toBe("DRAFTING");
    expect(drafting().submissions).toHaveLength(0);
  });

  it("refuses to evaluate a design with no classes", () => {
    expect(() => drafting().submitInitial("s1", design(), "key-1", now)).toThrow(AttemptStateError);
  });

  it("moves to submitted and keeps the document that was sent", () => {
    const attempt = submitted();
    expect(attempt.status).toBe("SUBMITTED");
    expect(attempt.submissionOfKind("INITIAL")!.document.entityCount).toBe(2);
  });

  it("refuses a second initial submission", () => {
    const attempt = submitted();
    expect(() => attempt.submitInitial("s2", doc, "key-2", now)).toThrow(/already been submitted/);
  });

  it("refuses to edit the design once it has been submitted", () => {
    const attempt = submitted();
    expect(() => attempt.updateDraft(design({ entities: [entity("late")] }))).toThrow(AttemptStateError);
  });

  it("keeps the change test closed until the first report exists", () => {
    const attempt = submitted();
    expect(() =>
      attempt.submitChangeTest("s2", { impacts: [], newEntities: [], narrative: "" }, "key-2", now),
    ).toThrow(/not open/);
  });

  it("runs the full loop once the change test is revealed", () => {
    const attempt = submitted();
    attempt.revealChangeTest();
    expect(attempt.status).toBe("CHANGE_TEST");

    attempt.submitChangeTest("s2", { impacts: [], newEntities: [], narrative: "done" }, "key-2", now);
    expect(attempt.status).toBe("COMPLETE");
    expect(attempt.completedAt).toEqual(now);
    expect(attempt.submissions).toHaveLength(2);
  });

  it("carries the original design onto the change-test submission", () => {
    // The change test scores the design that was submitted, not a later edit.
    const attempt = submitted();
    attempt.revealChangeTest();
    const changeTest = attempt.submitChangeTest("s2", { impacts: [], newEntities: [], narrative: "" }, "k", now);
    expect(changeTest.document).toBe(doc);
  });

  it("refuses to reveal the change test twice", () => {
    const attempt = submitted();
    attempt.revealChangeTest();
    expect(() => attempt.revealChangeTest()).toThrow(AttemptStateError);
  });

  it("survives a round trip through its snapshot", () => {
    const attempt = submitted();
    attempt.revealChangeTest();
    const restored = Attempt.rehydrate(attempt.toSnapshot());
    expect(restored.status).toBe("CHANGE_TEST");
    expect(restored.submissions).toHaveLength(1);
  });
});
