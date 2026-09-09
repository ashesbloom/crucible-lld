import Link from "next/link";
import { redirect } from "next/navigation";
import { PracticeService } from "@/application/PracticeService";
import { LEARNER_ID } from "@/lib/session";

export const dynamic = "force-dynamic";

const DIFFICULTY_LABEL = { STARTER: "Starter", CORE: "Core", STRETCH: "Stretch" } as const;

async function begin(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug"));
  const attempt = await new PracticeService().startAttempt(LEARNER_ID, slug);
  redirect(`/attempt/${attempt.id}`);
}

export default async function ProblemsPage() {
  const service = new PracticeService();
  const problems = await service.listProblems();
  const history = await service.history(LEARNER_ID);

  const attemptsByProblem = new Map<string, number>();
  for (const attempt of history) {
    attemptsByProblem.set(attempt.problemId, (attemptsByProblem.get(attempt.problemId) ?? 0) + 1);
  }

  return (
    <div className="shell" style={{ padding: "2.5rem 0 3rem" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Problems</h1>
      <p className="dim" style={{ marginTop: "0.6rem", maxWidth: "60ch" }}>
        Each one hides a requirement that arrives after your first review.
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        {problems.map((problem) => {
          const attempted = attemptsByProblem.get(problem.id) ?? 0;
          return (
            <article
              key={problem.id}
              style={{
                padding: "0.9rem 0",
                borderTop: "1px solid var(--ink-700)",
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "1fr auto",
                alignItems: "start",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: "var(--t-h4)" }}>{problem.title}</h2>
                  <span className="micro faint">
                    {DIFFICULTY_LABEL[problem.difficulty].toLowerCase()} · {problem.estimatedMinutes} min
                    {attempted > 0 && ` · ${attempted} attempted`}
                  </span>
                </div>

                <p className="small dim" style={{ margin: "0.3rem 0 0", maxWidth: "64ch" }}>{problem.summary}</p>

                <div className="micro faint ident" style={{ marginTop: "0.3rem" }}>
                  {problem.conceptsProbed.join(" · ")}
                </div>
              </div>

              <form action={begin}>
                <input type="hidden" name="slug" value={problem.slug} />
                <button type="submit" className="btn btn-ghost">
                  {attempted > 0 ? "again" : "start"}
                </button>
              </form>
            </article>
          );
        })}
      </div>

      <p className="micro faint" style={{ marginTop: "1.5rem", maxWidth: "60ch" }}>
        Problems live in the repository, not the database. They change when someone edits the
        file, so a table would have bought a migration and nothing else.{" "}
        <Link href="/design">Design note</Link>.
      </p>
    </div>
  );
}
