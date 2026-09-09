/**
 * Persistence for attempts and their submissions.
 *
 * The domain objects carry no persistence concerns at all, so everything about
 * translating between rows and aggregates lives here. That is what makes the
 * whole domain testable without a database.
 */

import type { Row } from "@libsql/client";
import { Attempt, type AttemptRepository, type AttemptStatus, type Submission, type SubmissionKind } from "@/domain/attempt/Attempt";
import { DesignDocument } from "@/domain/design/DesignDocument";
import type { ChangeTestResponse } from "@/domain/evaluation/BlastRadius";
import { ready } from "./client";

function iso(value: Date): string {
  return value.toISOString();
}

function date(value: unknown): Date {
  return new Date(String(value));
}

function toSubmission(row: Row): Submission {
  const rawResponse = row.change_test_response;
  return {
    id: String(row.id),
    attemptId: String(row.attempt_id),
    kind: String(row.kind) as SubmissionKind,
    document: DesignDocument.create(JSON.parse(String(row.document))),
    changeTestResponse: rawResponse ? (JSON.parse(String(rawResponse)) as ChangeTestResponse) : null,
    idempotencyKey: String(row.idempotency_key),
    submittedAt: date(row.submitted_at),
  };
}

export class LibsqlAttemptRepository implements AttemptRepository {
  async save(attempt: Attempt): Promise<void> {
    const client = await ready();
    const snapshot = attempt.toSnapshot();

    const statements = [
      {
        sql: `INSERT INTO attempts (id, learner_id, problem_id, attempt_number, status, draft, started_at, completed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET status = excluded.status, draft = excluded.draft, completed_at = excluded.completed_at`,
        args: [
          snapshot.id, snapshot.learnerId, snapshot.problemId, snapshot.attemptNumber,
          snapshot.status, JSON.stringify(snapshot.draft.toJSON()),
          iso(snapshot.startedAt), snapshot.completedAt ? iso(snapshot.completedAt) : null,
        ],
      },
      // Submissions are immutable once written, so a conflict means we are
      // re-saving an aggregate we already persisted, not changing history.
      ...snapshot.submissions.map((submission) => ({
        sql: `INSERT INTO submissions (id, attempt_id, kind, document, change_test_response, idempotency_key, submitted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO NOTHING`,
        args: [
          submission.id, submission.attemptId, submission.kind,
          JSON.stringify(submission.document.toJSON()),
          submission.changeTestResponse ? JSON.stringify(submission.changeTestResponse) : null,
          submission.idempotencyKey, iso(submission.submittedAt),
        ],
      })),
    ];

    await client.batch(statements, "write");
  }

  async findById(id: string): Promise<Attempt | null> {
    const client = await ready();
    const attemptRows = await client.execute({ sql: "SELECT * FROM attempts WHERE id = ?", args: [id] });
    const row = attemptRows.rows[0];
    if (!row) return null;

    const submissionRows = await client.execute({
      sql: "SELECT * FROM submissions WHERE attempt_id = ? ORDER BY submitted_at",
      args: [id],
    });

    return Attempt.rehydrate({
      id: String(row.id),
      learnerId: String(row.learner_id),
      problemId: String(row.problem_id),
      attemptNumber: Number(row.attempt_number),
      status: String(row.status) as AttemptStatus,
      draft: DesignDocument.create(JSON.parse(String(row.draft))),
      submissions: submissionRows.rows.map(toSubmission),
      startedAt: date(row.started_at),
      completedAt: row.completed_at ? date(row.completed_at) : null,
    });
  }

  async findByLearner(learnerId: string): Promise<readonly Attempt[]> {
    const client = await ready();
    const rows = await client.execute({
      sql: "SELECT id FROM attempts WHERE learner_id = ? ORDER BY started_at DESC",
      args: [learnerId],
    });

    const attempts = await Promise.all(rows.rows.map((row) => this.findById(String(row.id))));
    return attempts.filter((a): a is Attempt => a !== null);
  }

  async countForLearnerAndProblem(learnerId: string, problemId: string): Promise<number> {
    const client = await ready();
    const result = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM attempts WHERE learner_id = ? AND problem_id = ?",
      args: [learnerId, problemId],
    });
    return Number(result.rows[0]?.n ?? 0);
  }

  async findSubmissionByIdempotencyKey(attemptId: string, key: string): Promise<Submission | null> {
    const client = await ready();
    const result = await client.execute({
      sql: "SELECT * FROM submissions WHERE attempt_id = ? AND idempotency_key = ?",
      args: [attemptId, key],
    });
    const row = result.rows[0];
    return row ? toSubmission(row) : null;
  }

  async findSubmissionById(id: string): Promise<Submission | null> {
    const client = await ready();
    const result = await client.execute({ sql: "SELECT * FROM submissions WHERE id = ?", args: [id] });
    const row = result.rows[0];
    return row ? toSubmission(row) : null;
  }
}
