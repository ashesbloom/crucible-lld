import { Evaluation, type EvaluationRepository, type EvaluationStatus, type StageRecord } from "@/domain/evaluation/Evaluation";
import type { FeedbackReport } from "@/domain/evaluation/FeedbackReport";
import { ready } from "./client";

export class LibsqlEvaluationRepository implements EvaluationRepository {
  async save(evaluation: Evaluation): Promise<void> {
    const client = await ready();
    const s = evaluation.toSnapshot();

    await client.execute({
      sql: `INSERT INTO evaluations (id, submission_id, status, attempts, stages, report, error, created_at, started_at, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              status = excluded.status, attempts = excluded.attempts, stages = excluded.stages,
              report = excluded.report, error = excluded.error,
              started_at = excluded.started_at, finished_at = excluded.finished_at`,
      args: [
        s.id, s.submissionId, s.status, s.attempts,
        JSON.stringify(s.stages), s.report ? JSON.stringify(s.report) : null, s.error,
        s.createdAt.toISOString(),
        s.startedAt?.toISOString() ?? null,
        s.finishedAt?.toISOString() ?? null,
      ],
    });
  }

  async findById(id: string): Promise<Evaluation | null> {
    const client = await ready();
    const result = await client.execute({ sql: "SELECT * FROM evaluations WHERE id = ?", args: [id] });
    return result.rows[0] ? hydrate(result.rows[0]) : null;
  }

  async findBySubmissionId(submissionId: string): Promise<Evaluation | null> {
    const client = await ready();
    const result = await client.execute({
      sql: "SELECT * FROM evaluations WHERE submission_id = ?",
      args: [submissionId],
    });
    return result.rows[0] ? hydrate(result.rows[0]) : null;
  }

  /**
   * ponytail: a plain read, not an atomic claim. Correct because exactly one
   * in-process worker polls this table. If a second worker ever exists, add a
   * claimed_at column and reserve the row with an UPDATE ... RETURNING before
   * handing it to the domain; the Evaluation.start() guard stays as-is either way.
   */
  async claimNextQueued(): Promise<Evaluation | null> {
    const client = await ready();
    const result = await client.execute(
      "SELECT * FROM evaluations WHERE status = 'QUEUED' ORDER BY created_at LIMIT 1",
    );
    return result.rows[0] ? hydrate(result.rows[0]) : null;
  }
}

function hydrate(row: Record<string, unknown>): Evaluation {
  return Evaluation.rehydrate({
    id: String(row.id),
    submissionId: String(row.submission_id),
    status: String(row.status) as EvaluationStatus,
    attempts: Number(row.attempts),
    stages: JSON.parse(String(row.stages ?? "[]")) as StageRecord[],
    report: row.report ? (JSON.parse(String(row.report)) as FeedbackReport) : null,
    error: row.error ? String(row.error) : null,
    createdAt: new Date(String(row.created_at)),
    startedAt: row.started_at ? new Date(String(row.started_at)) : null,
    finishedAt: row.finished_at ? new Date(String(row.finished_at)) : null,
  });
}
