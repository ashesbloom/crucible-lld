/**
 * The lifecycle of one evaluation run.
 *
 * Status is stored, not derived. The first cut of the schema had no status
 * column at all and computed it as `report ? "done" : "pending"`, which reads
 * fine until you notice it gives the same answer for "queued two seconds ago"
 * and "failed after two retries". Retry becomes impossible to reason about and
 * the UI cannot tell a slow evaluation from a dead one. An explicit enum with
 * guarded transitions costs a few lines and removes the whole class of problem.
 *
 * The guards throw rather than returning false. A caller moving an evaluation
 * from QUEUED straight to COMPLETED has a bug, and silently tolerating it would
 * hide the bug behind plausible-looking data.
 */

import type { FeedbackReport } from "./FeedbackReport";

export type EvaluationStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
export type StageStatus = "PENDING" | "RUNNING" | "OK" | "SKIPPED" | "ERROR";

/**
 * One evaluator's progress. Exists so the UI can show what is actually
 * happening rather than a spinner that means nothing.
 */
export interface StageRecord {
  readonly evaluatorId: string;
  readonly label: string;
  readonly status: StageStatus;
  readonly note?: string;
  readonly durationMs?: number;
}

export const MAX_ATTEMPTS = 3;

export class IllegalTransitionError extends Error {
  constructor(from: EvaluationStatus, action: string) {
    super(`Cannot ${action} an evaluation in state ${from}.`);
    this.name = "IllegalTransitionError";
  }
}

export interface EvaluationSnapshot {
  readonly id: string;
  readonly submissionId: string;
  readonly status: EvaluationStatus;
  readonly attempts: number;
  readonly stages: readonly StageRecord[];
  readonly report: FeedbackReport | null;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

export class Evaluation {
  readonly id: string;
  readonly submissionId: string;
  readonly createdAt: Date;

  #status: EvaluationStatus;
  #attempts: number;
  #stages: StageRecord[];
  #report: FeedbackReport | null;
  #error: string | null;
  #startedAt: Date | null;
  #finishedAt: Date | null;

  private constructor(snapshot: EvaluationSnapshot) {
    this.id = snapshot.id;
    this.submissionId = snapshot.submissionId;
    this.createdAt = snapshot.createdAt;
    this.#status = snapshot.status;
    this.#attempts = snapshot.attempts;
    this.#stages = [...snapshot.stages];
    this.#report = snapshot.report;
    this.#error = snapshot.error;
    this.#startedAt = snapshot.startedAt;
    this.#finishedAt = snapshot.finishedAt;
  }

  static queue(id: string, submissionId: string, now: Date): Evaluation {
    return new Evaluation({
      id,
      submissionId,
      status: "QUEUED",
      attempts: 0,
      stages: [],
      report: null,
      error: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    });
  }

  static rehydrate(snapshot: EvaluationSnapshot): Evaluation {
    return new Evaluation(snapshot);
  }

  get status(): EvaluationStatus { return this.#status; }
  get attempts(): number { return this.#attempts; }
  get stages(): readonly StageRecord[] { return this.#stages; }
  get report(): FeedbackReport | null { return this.#report; }
  get error(): string | null { return this.#error; }
  get startedAt(): Date | null { return this.#startedAt; }
  get finishedAt(): Date | null { return this.#finishedAt; }

  isTerminal(): boolean {
    return this.#status === "COMPLETED" || this.#status === "FAILED";
  }

  canRetry(): boolean {
    return this.#status === "FAILED" && this.#attempts < MAX_ATTEMPTS;
  }

  start(now: Date): void {
    if (this.#status !== "QUEUED") throw new IllegalTransitionError(this.#status, "start");
    this.#status = "RUNNING";
    this.#attempts += 1;
    this.#startedAt = now;
    this.#error = null;
  }

  /** Called by the pipeline as each evaluator finishes, so progress is honest. */
  recordStage(stage: StageRecord): void {
    if (this.#status !== "RUNNING") throw new IllegalTransitionError(this.#status, "record a stage on");
    const index = this.#stages.findIndex((s) => s.evaluatorId === stage.evaluatorId);
    if (index === -1) this.#stages.push(stage);
    else this.#stages[index] = stage;
  }

  complete(report: FeedbackReport, now: Date): void {
    if (this.#status !== "RUNNING") throw new IllegalTransitionError(this.#status, "complete");
    this.#status = "COMPLETED";
    this.#report = report;
    this.#finishedAt = now;
    this.#error = null;
  }

  fail(reason: string, now: Date): void {
    if (this.#status !== "RUNNING" && this.#status !== "QUEUED") {
      throw new IllegalTransitionError(this.#status, "fail");
    }
    this.#status = "FAILED";
    this.#error = reason;
    this.#finishedAt = now;
  }

  /**
   * Back to the queue for another go. Capped, because an evaluator that fails
   * three times is broken rather than unlucky, and retrying forever would burn
   * API credit to produce the same error.
   */
  retry(): void {
    if (this.#status !== "FAILED") throw new IllegalTransitionError(this.#status, "retry");
    if (this.#attempts >= MAX_ATTEMPTS) {
      throw new Error(`Evaluation ${this.id} has already used all ${MAX_ATTEMPTS} attempts.`);
    }
    this.#status = "QUEUED";
    this.#stages = [];
    this.#finishedAt = null;
  }

  toSnapshot(): EvaluationSnapshot {
    return {
      id: this.id,
      submissionId: this.submissionId,
      status: this.#status,
      attempts: this.#attempts,
      stages: [...this.#stages],
      report: this.#report,
      error: this.#error,
      createdAt: this.createdAt,
      startedAt: this.#startedAt,
      finishedAt: this.#finishedAt,
    };
  }
}

export interface EvaluationRepository {
  save(evaluation: Evaluation): Promise<void>;
  findById(id: string): Promise<Evaluation | null>;
  findBySubmissionId(submissionId: string): Promise<Evaluation | null>;
  claimNextQueued(): Promise<Evaluation | null>;
}
