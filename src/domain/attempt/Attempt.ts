/**
 * One pass at one problem, from opening the canvas to finishing the change test.
 *
 * The status enum is the practice loop written down. Making it explicit is what
 * stops the UI from having to infer "should I show the change test yet?" by
 * poking at whether some other object happens to be non-null.
 */

import type { DesignDocument } from "../design/DesignDocument";
import type { ChangeTestResponse } from "../evaluation/BlastRadius";

export type AttemptStatus =
  /** Canvas open, nothing submitted. */
  | "DRAFTING"
  /** Initial design submitted; its evaluation may still be running. */
  | "SUBMITTED"
  /** Initial feedback delivered and the hidden requirement revealed. */
  | "CHANGE_TEST"
  /** Change test answered and scored. Nothing further to do. */
  | "COMPLETE";

export type SubmissionKind = "INITIAL" | "CHANGE_TEST";

export interface Submission {
  readonly id: string;
  readonly attemptId: string;
  readonly kind: SubmissionKind;
  readonly document: DesignDocument;
  readonly changeTestResponse: ChangeTestResponse | null;
  readonly idempotencyKey: string;
  readonly submittedAt: Date;
}

export class AttemptStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttemptStateError";
  }
}

export interface AttemptSnapshot {
  readonly id: string;
  readonly learnerId: string;
  readonly problemId: string;
  readonly attemptNumber: number;
  readonly status: AttemptStatus;
  readonly draft: DesignDocument;
  readonly submissions: readonly Submission[];
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export class Attempt {
  readonly id: string;
  readonly learnerId: string;
  readonly problemId: string;
  readonly attemptNumber: number;
  readonly startedAt: Date;

  #status: AttemptStatus;
  #draft: DesignDocument;
  #submissions: Submission[];
  #completedAt: Date | null;

  private constructor(snapshot: AttemptSnapshot) {
    this.id = snapshot.id;
    this.learnerId = snapshot.learnerId;
    this.problemId = snapshot.problemId;
    this.attemptNumber = snapshot.attemptNumber;
    this.startedAt = snapshot.startedAt;
    this.#status = snapshot.status;
    this.#draft = snapshot.draft;
    this.#submissions = [...snapshot.submissions];
    this.#completedAt = snapshot.completedAt;
  }

  static start(
    id: string,
    learnerId: string,
    problemId: string,
    attemptNumber: number,
    draft: DesignDocument,
    now: Date,
  ): Attempt {
    return new Attempt({
      id, learnerId, problemId, attemptNumber,
      status: "DRAFTING",
      draft,
      submissions: [],
      startedAt: now,
      completedAt: null,
    });
  }

  static rehydrate(snapshot: AttemptSnapshot): Attempt {
    return new Attempt(snapshot);
  }

  get status(): AttemptStatus { return this.#status; }
  get draft(): DesignDocument { return this.#draft; }
  get submissions(): readonly Submission[] { return this.#submissions; }
  get completedAt(): Date | null { return this.#completedAt; }

  submissionOfKind(kind: SubmissionKind): Submission | undefined {
    return this.#submissions.find((s) => s.kind === kind);
  }

  /** Autosave. Allowed only while the design is still the learner's to change. */
  updateDraft(document: DesignDocument): void {
    if (this.#status !== "DRAFTING") {
      throw new AttemptStateError(`Cannot edit the design of a ${this.#status} attempt.`);
    }
    this.#draft = document;
  }

  submitInitial(id: string, document: DesignDocument, idempotencyKey: string, now: Date): Submission {
    if (this.#status !== "DRAFTING") {
      throw new AttemptStateError(`Attempt ${this.id} has already been submitted (status ${this.#status}).`);
    }
    if (document.isEmpty()) {
      throw new AttemptStateError("A design with no classes cannot be evaluated.");
    }
    const submission: Submission = {
      id, attemptId: this.id, kind: "INITIAL",
      document, changeTestResponse: null, idempotencyKey, submittedAt: now,
    };
    this.#submissions.push(submission);
    this.#draft = document;
    this.#status = "SUBMITTED";
    return submission;
  }

  /** Called once the initial report exists. The requirement is hidden until here. */
  revealChangeTest(): void {
    if (this.#status !== "SUBMITTED") {
      throw new AttemptStateError(`Cannot reveal the change test from status ${this.#status}.`);
    }
    this.#status = "CHANGE_TEST";
  }

  submitChangeTest(
    id: string,
    response: ChangeTestResponse,
    idempotencyKey: string,
    now: Date,
  ): Submission {
    if (this.#status !== "CHANGE_TEST") {
      throw new AttemptStateError(`The change test is not open for attempt ${this.id} (status ${this.#status}).`);
    }
    const initial = this.submissionOfKind("INITIAL");
    if (!initial) throw new AttemptStateError("No initial submission to compare the change test against.");

    const submission: Submission = {
      id, attemptId: this.id, kind: "CHANGE_TEST",
      document: initial.document, changeTestResponse: response, idempotencyKey, submittedAt: now,
    };
    this.#submissions.push(submission);
    this.#status = "COMPLETE";
    this.#completedAt = now;
    return submission;
  }

  toSnapshot(): AttemptSnapshot {
    return {
      id: this.id,
      learnerId: this.learnerId,
      problemId: this.problemId,
      attemptNumber: this.attemptNumber,
      status: this.#status,
      draft: this.#draft,
      submissions: [...this.#submissions],
      startedAt: this.startedAt,
      completedAt: this.#completedAt,
    };
  }
}

export interface AttemptRepository {
  save(attempt: Attempt): Promise<void>;
  findById(id: string): Promise<Attempt | null>;
  findByLearner(learnerId: string): Promise<readonly Attempt[]>;
  countForLearnerAndProblem(learnerId: string, problemId: string): Promise<number>;
  findSubmissionByIdempotencyKey(attemptId: string, key: string): Promise<Submission | null>;
  findSubmissionById(id: string): Promise<Submission | null>;
}
