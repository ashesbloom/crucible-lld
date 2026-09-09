/**
 * The same three-step marker on every screen of an attempt, so it is always
 * clear which part of the loop you are in and what is still ahead.
 */

const STEPS = [
  { id: "design", label: "design" },
  { id: "review", label: "review" },
  { id: "change", label: "change test" },
] as const;

export type Step = (typeof STEPS)[number]["id"];

export function AttemptHeader({
  title,
  attemptNumber,
  step,
}: {
  title: string;
  attemptNumber: number;
  step: Step;
}) {
  const current = STEPS.findIndex((s) => s.id === step);

  return (
    <header style={{ marginBottom: "1.4rem", display: "flex", justifyContent: "space-between", gap: "1.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: "var(--t-h2)" }}>{title}</h1>
        <p className="small faint" style={{ margin: "0.25rem 0 0" }}>
          Attempt {attemptNumber}
        </p>
      </div>

      <ol style={{ listStyle: "none", display: "flex", gap: "0.4rem", padding: 0, margin: 0 }}>
        {STEPS.map((item, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li
              key={item.id}
              aria-current={active ? "step" : undefined}
              className="small"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.3rem 0.7rem",
                borderRadius: "var(--radius)",
                border: `1px solid ${active ? "var(--contained)" : "var(--ink-600)"}`,
                color: active ? "var(--chalk)" : done ? "var(--chalk-dim)" : "var(--chalk-faint)",
                background: "transparent",
              }}
            >
              <span aria-hidden style={{ color: done ? "var(--contained)" : "inherit" }}>
                {done ? "●" : "○"}
              </span>
              {item.label}
            </li>
          );
        })}
      </ol>
    </header>
  );
}
