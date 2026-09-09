/**
 * The practice loop as use cases.
 *
 * Thin on purpose. Every rule about what is allowed lives in the aggregates,
 * so these methods mostly load, call one domain method, and save. When a
 * service starts making decisions the domain should be making, the domain has
 * a gap.
 */

import { Attempt, type Submission } from "@/domain/attempt/Attempt";
import { DesignDocument, type DesignDocumentInput } from "@/domain/design/DesignDocument";
import type { ChangeTestResponse } from "@/domain/evaluation/BlastRadius";
import { Evaluation } from "@/domain/evaluation/Evaluation";
import { combineReports } from "@/domain/evaluation/CombinedScore";
import type { Problem } from "@/domain/problem/Problem";
import type { CriterionScore } from "@/domain/rubric/Rubric";
import { container, type Container } from "./container";

export interface SubmitResult {
  readonly evaluationId: string;
  readonly submissionId: string;
  /** True when this exact request had already been accepted. */
  readonly deduplicated: boolean;
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} does not exist.`);
    this.name = "NotFoundError";
  }
}

export class PracticeService {
  constructor(private readonly c: Container = container()) {}

  async listProblems(): Promise<readonly Problem[]> {
    return this.c.problems.list();
  }

  async problemBySlug(slug: string): Promise<Problem> {
    const problem = await this.c.problems.findBySlug(slug);
    if (!problem) throw new NotFoundError("Problem", slug);
    return problem;
  }

  async requireAttempt(id: string): Promise<Attempt> {
    const attempt = await this.c.attempts.findById(id);
    if (!attempt) throw new NotFoundError("Attempt", id);
    return attempt;
  }

  async startAttempt(learnerId: string, problemSlug: string): Promise<Attempt> {
    const problem = await this.problemBySlug(problemSlug);
    const previous = await this.c.attempts.countForLearnerAndProblem(learnerId, problem.id);

    const attempt = Attempt.start(
      this.c.ids.next(),
      learnerId,
      problem.id,
      previous + 1,
      DesignDocument.empty(),
      this.c.clock.now(),
    );

    await this.c.attempts.save(attempt);
    return attempt;
  }

  /** Autosave. The aggregate refuses once the design has been submitted. */
  async saveDraft(attemptId: string, input: DesignDocumentInput): Promise<void> {
    const attempt = await this.requireAttempt(attemptId);
    attempt.updateDraft(DesignDocument.create(input));
    await this.c.attempts.save(attempt);
  }

  async submitDesign(
    attemptId: string,
    input: DesignDocumentInput,
    idempotencyKey: string,
  ): Promise<SubmitResult> {
    const replay = await this.replayOf(attemptId, idempotencyKey);
    if (replay) return replay;

    const attempt = await this.requireAttempt(attemptId);
    const submission = attempt.submitInitial(
      this.c.ids.next(),
      DesignDocument.create(input),
      idempotencyKey,
      this.c.clock.now(),
    );

    return this.persistAndQueue(attempt, submission);
  }

  async revealChangeTest(attemptId: string): Promise<Attempt> {
    const attempt = await this.requireAttempt(attemptId);
    if (attempt.status === "SUBMITTED") {
      attempt.revealChangeTest();
      await this.c.attempts.save(attempt);
    }
    return attempt;
  }

  async submitChangeTest(
    attemptId: string,
    response: ChangeTestResponse,
    idempotencyKey: string,
  ): Promise<SubmitResult> {
    const replay = await this.replayOf(attemptId, idempotencyKey);
    if (replay) return replay;

    const attempt = await this.requireAttempt(attemptId);
    const submission = attempt.submitChangeTest(
      this.c.ids.next(),
      response,
      idempotencyKey,
      this.c.clock.now(),
    );

    return this.persistAndQueue(attempt, submission);
  }

  /**
   * The idempotency guarantee.
   *
   * A learner double-clicking Submit, or a flaky connection retrying the POST,
   * must not produce two evaluations and must not spend two API calls. The key
   * is unique per attempt in the database, so the second request finds the
   * first one's work and returns it.
   *
   * Scoped to the attempt on purpose. A globally unique key would mean a client
   * that reuses a key across two attempts silently receives the wrong attempt's
   * report, which is a worse failure than the duplicate it was preventing.
   */
  private async replayOf(attemptId: string, idempotencyKey: string): Promise<SubmitResult | null> {
    const existing = await this.c.attempts.findSubmissionByIdempotencyKey(attemptId, idempotencyKey);
    if (!existing) return null;

    const evaluation = await this.c.evaluations.findBySubmissionId(existing.id);
    if (!evaluation) return null;

    return { evaluationId: evaluation.id, submissionId: existing.id, deduplicated: true };
  }

  /**
   * Store first, evaluate later. The submission is durable before any evaluator
   * runs, so a crashed or failing evaluator loses the feedback, never the work.
   */
  private async persistAndQueue(attempt: Attempt, submission: Submission): Promise<SubmitResult> {
    const evaluation = Evaluation.queue(this.c.ids.next(), submission.id, this.c.clock.now());

    await this.c.attempts.save(attempt);
    await this.c.evaluations.save(evaluation);

    return { evaluationId: evaluation.id, submissionId: submission.id, deduplicated: false };
  }

  async evaluation(id: string): Promise<Evaluation> {
    const evaluation = await this.c.evaluations.findById(id);
    if (!evaluation) throw new NotFoundError("Evaluation", id);
    return evaluation;
  }

  async retryEvaluation(id: string): Promise<Evaluation> {
    const evaluation = await this.evaluation(id);
    if (evaluation.canRetry()) {
      evaluation.retry();
      await this.c.evaluations.save(evaluation);
    }
    return evaluation;
  }

  async evaluationForSubmission(submissionId: string): Promise<Evaluation | null> {
    return this.c.evaluations.findBySubmissionId(submissionId);
  }

  /** The shape the API returns, so a server component can hand the client the same thing. */
  static toView(evaluation: Evaluation) {
    return {
      id: evaluation.id,
      status: evaluation.status,
      attempts: evaluation.attempts,
      stages: [...evaluation.stages],
      error: evaluation.error,
      canRetry: evaluation.canRetry(),
      report: evaluation.report,
    };
  }

  async history(learnerId: string): Promise<readonly Attempt[]> {
    return this.c.attempts.findByLearner(learnerId);
  }

  /**
   * History with the scores attached.
   *
   * Assembled here rather than in the page because it spans three repositories,
   * and a view that has to know which submission holds the change-test report is
   * a query, not a rendering concern.
   */
  async historyView(learnerId: string): Promise<readonly AttemptSummary[]> {
    const attempts = await this.c.attempts.findByLearner(learnerId);
    const problems = await this.c.problems.list();

    return Promise.all(
      attempts.map(async (attempt): Promise<AttemptSummary> => {
        // Neither round alone is the attempt's score. The first judges the
        // design but cannot score extensibility; the second scores extensibility
        // and nothing else. Combining them is the attempt's actual result.
        const initial = attempt.submissionOfKind("INITIAL");
        const changeTest = attempt.submissionOfKind("CHANGE_TEST");

        const reports = await Promise.all(
          [initial, changeTest].map(async (submission) =>
            submission ? (await this.c.evaluations.findBySubmissionId(submission.id))?.report ?? null : null,
          ),
        );

        const problem = problems.find((p) => p.id === attempt.problemId);
        const combined = problem ? combineReports(this.c.rubrics.get(problem.rubricId), reports) : null;

        return {
          id: attempt.id,
          problemId: attempt.problemId,
          problemTitle: problem?.title ?? attempt.problemId,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          startedAt: attempt.startedAt,
          overall: combined?.score.overall ?? null,
          coverage: combined?.score.coverage ?? null,
          criteria: combined?.score.criteria ?? null,
          blastRadius: combined?.blastRadius
            ? {
                radius: combined.blastRadius.radius,
                par: combined.blastRadius.par,
                band: combined.blastRadius.band,
              }
            : null,
        };
      }),
    );
  }
}

export interface AttemptSummary {
  readonly id: string;
  readonly problemId: string;
  readonly problemTitle: string;
  readonly attemptNumber: number;
  readonly status: string;
  readonly startedAt: Date;
  readonly overall: number | null;
  readonly coverage: number | null;
  readonly criteria: readonly CriterionScore[] | null;
  readonly blastRadius: { radius: number; par: number; band: string } | null;
}
