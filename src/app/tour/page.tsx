import Link from "next/link";
import { PracticeService, type AttemptSummary } from "@/application/PracticeService";
import { SeedButton } from "@/components/SeedButton";
import { LEARNER_ID } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TourPage() {
  const service = new PracticeService();
  const attempts = await service.history(LEARNER_ID);
  const summaries = await service.historyView(LEARNER_ID);

  const open = attempts.find((a) => a.status === "DRAFTING");
  const best = pickBest(summaries);

  return (
    <div className="shell" style={{ padding: "2.5rem 0 3rem" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Tour</h1>
      <p className="dim" style={{ marginTop: "0.6rem", maxWidth: "62ch" }}>
        Five links into a seeded account with three attempts already behind it. Steps 3 and 4
        are the ones nobody else does.
      </p>

      {attempts.length === 0 ? (
        <div className="panel" style={{ padding: "1rem", maxWidth: "40rem" }}>
          <p className="small" style={{ marginBottom: "0.7rem" }}>
            Nothing seeded yet. This runs three attempts through the real service and worker.
          </p>
          <SeedButton />
        </div>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: "1.5rem 0 0" }}>
          <Step n={1} title="pick a problem" href="/problems" cta="problems" />
          <Step
            n={2}
            title="design it"
            href={open ? `/attempt/${open.id}` : "/problems"}
            cta={open ? "half-finished design" : "start one"}
          />
          <Step
            n={3}
            title="read the review"
            href={best ? `/attempt/${best.id}/report` : "/history"}
            cta="a finished review"
            emphasis
          />
          <Step
            n={4}
            title="take the change test"
            href={best ? `/attempt/${best.id}/change-test` : "/history"}
            cta="a scored change test"
            emphasis
          />
          <Step n={5} title="come back and do better" href="/history" cta="history" />
        </ol>
      )}

      <hr className="rule" style={{ margin: "2rem 0 1rem" }} />

      <p className="small dim">
        Or read the notes: <Link href="/research">research</Link> ·{" "}
        <Link href="/design">design</Link> · <Link href="/ai-usage">ai usage</Link>
      </p>
    </div>
  );
}

function Step({
  n, title, href, cta, emphasis,
}: { n: number; title: string; href: string; cta: string; emphasis?: boolean }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "0.8rem",
        padding: "0.5rem 0",
        borderTop: "1px solid var(--ink-700)",
        flexWrap: "wrap",
      }}
    >
      <span className="metric faint small">{String(n).padStart(2, "0")}</span>
      <span style={{ minWidth: "14rem" }}>{title}</span>
      {emphasis && <span className="chip impact-modified">the different bit</span>}
      <Link href={href} className="small" style={{ marginLeft: "auto" }}>{cta} →</Link>
    </li>
  );
}

/** The completed attempt that best shows the loop: a finished change test. */
function pickBest(summaries: readonly AttemptSummary[]): AttemptSummary | undefined {
  const complete = summaries.filter((s) => s.status === "COMPLETE" && s.blastRadius);
  return complete.find((s) => s.blastRadius!.band === "CONTAINED") ?? complete[0];
}
