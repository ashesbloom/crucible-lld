/**
 * Runs queued evaluations out of band.
 *
 * The brief asks for this to stay practical, so it is: an in-process pump, not
 * a queue service. Submit writes the work down and returns immediately, this
 * picks it up, and the UI polls. No Redis, no second process, no broker.
 *
 * What it does take seriously is the failure path. The submission is already
 * durable before the pump ever runs, so a failing evaluator costs the learner
 * their feedback and never their work, and a failed evaluation stays retryable
 * up to its cap.
 */

import type { EvaluationContext } from "@/domain/evaluation/Evaluator";
import { Evaluation } from "@/domain/evaluation/Evaluation";
import { container, type Container } from "./container";

/** Re-entrancy guard. Two concurrent pumps would both claim the same row. */
let pumping = false;

export class EvaluationWorker {
  constructor(private readonly c: Container = container()) {}

  /**
   * Drains the queue. Safe to call from anywhere, including the status endpoint,
   * which is what makes the system self-healing: an evaluation orphaned by a
   * process restart gets picked up the next time anyone looks at it.
   */
  async pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const evaluation = await this.c.evaluations.claimNextQueued();
        if (!evaluation) return;
        await this.process(evaluation);
      }
    } finally {
      pumping = false;
    }
  }

  /** Fire and forget. Callers must not wait on evaluation to answer a request. */
  kick(): void {
    void this.pump().catch((error) => {
      console.error("[worker] pump failed", error);
    });
  }

  private async process(evaluation: Evaluation): Promise<void> {
    evaluation.start(this.c.clock.now());
    await this.c.evaluations.save(evaluation);

    try {
      const context = await this.contextFor(evaluation);

      // Each stage is written as it settles so the UI can show what is actually
      // happening rather than a spinner that means nothing.
      const report = await this.c.pipeline.run(context, (run) => {
        evaluation.recordStage({
          evaluatorId: run.evaluatorId,
          label: run.label,
          status: run.ok ? "OK" : "ERROR",
          note: run.note,
          durationMs: run.durationMs,
        });
        void this.c.evaluations.save(evaluation).catch(() => {});
      });

      evaluation.complete(report, this.c.clock.now());
    } catch (cause) {
      evaluation.fail(cause instanceof Error ? cause.message : String(cause), this.c.clock.now());
    }

    await this.c.evaluations.save(evaluation);
  }

  private async contextFor(evaluation: Evaluation): Promise<EvaluationContext> {
    const submission = await this.c.attempts.findSubmissionById(evaluation.submissionId);
    if (!submission) throw new Error(`Submission ${evaluation.submissionId} vanished.`);

    const attempt = await this.c.attempts.findById(submission.attemptId);
    if (!attempt) throw new Error(`Attempt ${submission.attemptId} vanished.`);

    const problem = await this.c.problems.findById(attempt.problemId);
    if (!problem) throw new Error(`Problem ${attempt.problemId} is not in the seed set.`);

    return {
      problem,
      rubric: this.c.rubrics.get(problem.rubricId),
      document: submission.document,
      kind: submission.kind,
      changeTestResponse: submission.changeTestResponse,
    };
  }
}

export const worker = new EvaluationWorker();
