import Link from "next/link";
import { PracticeService, type AttemptSummary } from "@/application/PracticeService";
import { CriterionTrend } from "@/components/CriterionTrend";
import { LLD_V1 } from "@/domain/rubric/rubrics/lldV1";
import { LEVEL_VALUE, type LevelId } from "@/domain/rubric/Rubric";
import { LEARNER_ID } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const summaries = await new PracticeService().historyView(LEARNER_ID);
  const scored = summaries.filter((s) => s.criteria !== null).slice().reverse();

  if (scored.length === 0) {
    return (
      <div className="shell" style={{ padding: "2.5rem 0" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>History</h1>
        <p className="dim" style={{ marginTop: "0.6rem", maxWidth: "56ch" }}>
          Nothing scored yet. One attempt is a score. Four show which criterion you keep
          getting wrong.
        </p>
        <Link href="/problems" className="btn btn-ghost">start a problem</Link>
      </div>
    );
  }

  const weakest = weakestCriterion(scored);

  return (
    <div className="shell" style={{ padding: "2.5rem 0 3rem" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>History</h1>
      <p className="dim small" style={{ marginTop: "0.5rem" }}>
        {scored.length} scored {scored.length === 1 ? "attempt" : "attempts"}, oldest first.
      </p>

      {weakest && (
        <p style={{ marginTop: "1rem", maxWidth: "64ch" }}>
          <span className="chip impact-modified">recurring weakness</span>{" "}
          <strong>{weakest.criterion.name}</strong>, weakest across {weakest.count} attempts.{" "}
          <span className="dim">To move up a level: {weakest.nextDescriptor}</span>
        </p>
      )}

      <hr className="rule" style={{ margin: "1.8rem 0 1.2rem" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.7rem" }}>
        {LLD_V1.criteria.map((criterion) => (
          <CriterionTrend
            key={criterion.id}
            name={criterion.name}
            weight={criterion.weight}
            points={scored.map((attempt) => ({
              label: `${attempt.problemTitle} #${attempt.attemptNumber}`,
              level: attempt.criteria?.find((c) => c.criterionId === criterion.id)?.level ?? null,
              assessed: attempt.criteria?.find((c) => c.criterionId === criterion.id)?.assessed ?? false,
            }))}
          />
        ))}
      </div>

      <hr className="rule" style={{ margin: "1.8rem 0 1.2rem" }} />

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--t-small)" }}>
          <caption className="sr-only">Every scored attempt with its overall score and blast radius</caption>
          <thead>
            <tr>
              {["problem", "n", "started", "score", "blast radius", ""].map((heading) => (
                <th key={heading} style={{ textAlign: "left", padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--ink-600)", color: "var(--chalk-dim)", fontWeight: 600 }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...scored].reverse().map((attempt) => (
              <tr key={attempt.id}>
                <td style={cell}>{attempt.problemTitle}</td>
                <td style={cell} className="metric">{attempt.attemptNumber}</td>
                <td style={cell} className="dim">
                  {new Date(attempt.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </td>
                <td style={cell} className="metric">
                  {attempt.overall}
                  {attempt.coverage !== null && attempt.coverage < 100 && (
                    <span className="faint micro"> of {attempt.coverage}%</span>
                  )}
                </td>
                <td style={cell}>
                  {attempt.blastRadius ? (
                    <span className="metric">
                      {Math.round(attempt.blastRadius.radius * 100)}%
                      <span className="faint"> vs {Math.round(attempt.blastRadius.par * 100)}% par</span>
                    </span>
                  ) : (
                    <span className="faint">not taken</span>
                  )}
                </td>
                <td style={cell}>
                  <Link href={`/attempt/${attempt.id}/report`}>review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cell = { padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--ink-700)" } as const;

/** The lowest mean level across attempts where it was actually assessed. */
function weakestCriterion(attempts: readonly AttemptSummary[]) {
  let worst: { criterion: (typeof LLD_V1.criteria)[number]; mean: number; count: number; nextDescriptor: string } | null = null;

  for (const criterion of LLD_V1.criteria) {
    const levels = attempts
      .map((a) => a.criteria?.find((c) => c.criterionId === criterion.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c?.assessed))
      .map((c) => LEVEL_VALUE[c.level]);

    if (levels.length === 0) continue;

    const mean = levels.reduce((sum, v) => sum + v, 0) / levels.length;
    if (!worst || mean < worst.mean) {
      const target = Math.min(Math.floor(mean) + 1, 3);
      const next = criterion.levels.find((l) => LEVEL_VALUE[l.level as LevelId] === target);
      worst = { criterion, mean, count: levels.length, nextDescriptor: next?.descriptor ?? "" };
    }
  }

  return worst;
}
