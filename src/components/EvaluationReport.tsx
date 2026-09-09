"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Diagram } from "@/components/Diagram";
import { useEvaluationStatus, type EvaluationView } from "@/components/useEvaluationStatus";
import { DesignDocument, type DesignDocumentInput } from "@/domain/design/DesignDocument";
import { toMermaid } from "@/domain/design/MermaidEmitter";
import type { EvidenceRef, Finding } from "@/domain/evaluation/Finding";
import type { CriterionScore, Criterion, EvaluationSource, LevelId } from "@/domain/rubric/Rubric";

const LEVEL_NAME: Record<LevelId, string> = { L0: "Missing", L1: "Emerging", L2: "Solid", L3: "Strong" };
const LEVEL_VALUE: Record<LevelId, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };

const SOURCE_LABEL: Record<EvaluationSource, string> = {
  DETERMINISTIC: "counted",
  LLM: "judged by a model",
  HEURISTIC: "heuristic, no API key",
};

const SOURCE_CLASS: Record<EvaluationSource, string> = {
  DETERMINISTIC: "impact-unchanged",
  LLM: "impact-new",
  HEURISTIC: "impact-modified",
};

interface Props {
  attemptId: string;
  evaluationId: string;
  /** Rendered on the server, so a finished report needs no round trip. */
  initial: EvaluationView | null;
  document: DesignDocumentInput;
  rubric: { id: string; version: number; criteria: Criterion[] };
  requirements: readonly string[];
  changeTestDone: boolean;
}

export function EvaluationReport({ attemptId, evaluationId, initial, document, rubric, requirements, changeTestDone }: Props) {
  const router = useRouter();
  const view = useEvaluationStatus(evaluationId, { initial });
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [revealing, setRevealing] = useState(false);

  const parsed = useMemo(() => DesignDocument.create(document), [document]);
  const mermaid = useMemo(() => toMermaid(parsed, { highlighted }), [parsed, highlighted]);

  async function toChangeTest() {
    setRevealing(true);
    await fetch(`/api/attempts/${attemptId}/reveal`, { method: "POST" });
    router.push(`/attempt/${attemptId}/change-test`);
  }

  if (!view) return <Waiting stages={[]} label="Loading the review…" />;

  if (view.status === "QUEUED" || view.status === "RUNNING") {
    return <Waiting stages={view.stages} label="Reviewing your design" />;
  }

  if (view.status === "FAILED" || !view.report) {
    return <Failed evaluationId={evaluationId} error={view.error} canRetry={view.canRetry} attempts={view.attempts} />;
  }

  const report = view.report;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.8fr)", gap: "1.5rem", alignItems: "start" }}>
      <div className="stack" style={{ ["--gap" as string]: "1rem" }}>
        <div className="panel" style={{ padding: "0.9rem 1rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", flexWrap: "wrap" }}>
            <span className="metric" style={{ fontSize: "var(--t-display)", lineHeight: 1 }}>
              {report.score.overall}
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>{report.score.band}</div>
              <div className="micro faint">
                {report.score.coverage === 100
                  ? "all six criteria"
                  : `${report.score.coverage}% of the rubric — extensibility comes from the change test`}
                {" · "}
                {report.rubricId} v{report.rubricVersion}
              </div>
            </div>
          </div>

          <p className="small dim" style={{ margin: "0.8rem 0 0", maxWidth: "62ch" }}>{report.summary}</p>

          {report.degraded && (
            <p className="small" style={{ margin: "0.6rem 0 0" }}>
              Part of this review is missing rather than negative. Those criteria read
              not assessed below.
            </p>
          )}
        </div>

        {report.nextActions.length > 0 && (
          <div className="panel" style={{ padding: "0.9rem 1rem" }}>
            <h2 style={{ fontSize: "var(--t-h4)" }}>Next time</h2>
            <ol className="stack small" style={{ ["--gap" as string]: "0.4rem", margin: "0.6rem 0 0", paddingLeft: "1.1rem" }}>
              {report.nextActions.map((action) => (
                <li key={action} className="dim">{action}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="stack" style={{ ["--gap" as string]: "0.7rem" }}>
          {report.score.criteria.map((score) => (
            <CriterionCard
              key={score.criterionId}
              score={score}
              criterion={rubric.criteria.find((c) => c.id === score.criterionId)!}
              findings={report.findings.filter((f) => f.criterionId === score.criterionId)}
              document={parsed}
              requirements={requirements}
              onHighlight={setHighlighted}
            />
          ))}
        </div>

        <div className="panel-quiet micro faint" style={{ padding: "0.6rem 0.7rem", display: "grid", gap: "0.3rem" }}>
          {report.runs.map((run) => (
            <div key={run.evaluatorId} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <span>
                {run.ok ? "✓" : "✕"} {run.label}
                {run.note ? ` — ${run.note}` : ""}
              </span>
              <span className="metric">{run.durationMs}ms</span>
            </div>
          ))}
          {report.discardedFindings > 0 && (
            <div style={{ color: "var(--chalk-dim)" }}>
              {report.discardedFindings} finding{report.discardedFindings === 1 ? "" : "s"} discarded for
              citing a class that is not in your design.
            </div>
          )}
        </div>
      </div>

      <aside style={{ position: "sticky", top: "1rem", display: "grid", gap: "0.8rem" }}>
        <div className="vellum">
          <div className="small" style={{ padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--ink-600)", fontWeight: 600 }}>
            What you submitted
          </div>
          <Diagram source={mermaid} />
          <div className="micro faint" style={{ padding: "0 0.6rem 0.6rem" }}>
            Hover a class name in the review to find it here.
          </div>
        </div>

        <div className="panel" style={{ padding: "0.9rem 1rem" }}>
          {changeTestDone ? (
            <>
              <div style={{ fontWeight: 600 }}>Change test done</div>
              <Link href={`/attempt/${attemptId}/change-test`} className="btn btn-ghost" style={{ marginTop: "0.5rem" }}>
                see the result
              </Link>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600 }}>One requirement left</div>
              <p className="small dim" style={{ margin: "0.3rem 0 0.6rem" }}>
                You have not seen it. What it costs your design is the last criterion.
              </p>
              <button onClick={toChangeTest} disabled={revealing} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                {revealing ? "Opening…" : "Reveal the change"}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function CriterionCard({
  score, criterion, findings, document, requirements, onHighlight,
}: {
  score: CriterionScore;
  criterion: Criterion;
  findings: readonly Finding[];
  document: DesignDocument;
  requirements: readonly string[];
  onHighlight: (ids: Set<string>) => void;
}) {
  const colour =
    score.level === "L0" ? "var(--wide)" : score.level === "L1" ? "var(--modified)" : "var(--contained)";

  return (
    <article className="panel" style={{ padding: "0.9rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: "var(--t-h4)" }}>{criterion.name}</h3>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <span className={`chip ${score.scoredBy ? SOURCE_CLASS[score.scoredBy] : ""}`}>
            {score.scoredBy ? SOURCE_LABEL[score.scoredBy] : "not assessed"}
          </span>
          <span className="micro faint metric">{criterion.weight}%</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "0.6rem 0 0.8rem" }}>
        <div className="levels" style={{ flex: 1, ["--level-color" as string]: colour }}>
          {([0, 1, 2, 3] as const).map((step) => (
            <span key={step} className="level-step" data-on={step <= LEVEL_VALUE[score.level]} />
          ))}
        </div>
        {/* The bar carries the level; the word stays in ink. Small text in a
            status colour would be identity by colour alone and would not clear
            4.5:1 for the lower two steps. */}
        <span className="small" style={{ fontWeight: 600, minWidth: "5.5rem" }}>
          {score.assessed ? LEVEL_NAME[score.level] : "Not assessed"}
        </span>
      </div>

      {findings.map((finding, index) => (
        <div key={index} style={{ marginTop: index === 0 ? 0 : "0.8rem" }}>
          <div style={{ fontWeight: 600 }}>{finding.headline}</div>
          {finding.concern && <p className="small dim" style={{ margin: "0.3rem 0 0" }}>{finding.concern}</p>}
          {finding.suggestion && (
            <p className="small" style={{ margin: "0.3rem 0 0" }}>→ {finding.suggestion}</p>
          )}
          {finding.evidence.length > 0 && (
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              {finding.evidence.map((ref, i) => (
                <EvidenceChip
                  key={i}
                  refr={ref}
                  document={document}
                  requirements={requirements}
                  onHighlight={onHighlight}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <details style={{ marginTop: "0.8rem" }}>
        <summary className="micro faint" style={{ cursor: "pointer" }}>
          the four levels
        </summary>
        <ul style={{ listStyle: "none", padding: 0, margin: "0.6rem 0 0", display: "grid", gap: "0.3rem" }}>
          {criterion.levels.map((level) => (
            <li
              key={level.level}
              className="micro"
              style={{
                color: level.level === score.level ? "var(--chalk)" : "var(--chalk-faint)",
                paddingLeft: "0.7rem",
                borderLeft: `2px solid ${level.level === score.level ? colour : "var(--ink-600)"}`,
              }}
            >
              {level.descriptor}
            </li>
          ))}
        </ul>
        <p className="micro faint" style={{ margin: "0.7rem 0 0" }}>{criterion.why}</p>
      </details>
    </article>
  );
}

/**
 * Every criticism points at something. Hovering a chip finds it in the diagram,
 * which is the difference between feedback you can check and feedback you have
 * to take on trust.
 */
function EvidenceChip({
  refr, document, requirements, onHighlight,
}: {
  refr: EvidenceRef;
  document: DesignDocument;
  requirements: readonly string[];
  onHighlight: (ids: Set<string>) => void;
}) {
  if (refr.kind === "ENTITY") {
    const entity = document.entity(refr.id);
    if (!entity) return null;
    return (
      <button
        className="chip ident"
        onMouseEnter={() => onHighlight(new Set([refr.id]))}
        onMouseLeave={() => onHighlight(new Set())}
        onFocus={() => onHighlight(new Set([refr.id]))}
        onBlur={() => onHighlight(new Set())}
        style={{ cursor: "help" }}
      >
        {entity.name}
      </button>
    );
  }

  const label =
    refr.kind === "REQUIREMENT"
      ? requirements[refr.index]
      : refr.kind === "DECISION"
        ? document.decisions[refr.index]?.title
        : document.assumptions[refr.index];

  if (!label) return null;
  return <span className="chip">{truncate(label, 52)}</span>;
}

function Waiting({ stages, label }: { stages: readonly { evaluatorId: string; label: string; status: string; note?: string }[]; label: string }) {
  return (
    <div className="panel" style={{ padding: "1.2rem", maxWidth: "44rem" }}>
      <h2 style={{ fontSize: "var(--t-h3)" }}>{label}</h2>
      <p className="dim small" style={{ marginTop: "0.3rem" }}>
        Your design is already saved. Nothing here can lose it.
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", display: "grid", gap: "0.4rem" }}>
        {stages.length === 0 && <li className="small faint">Starting the checks…</li>}
        {stages.map((stage) => (
          <li key={stage.evaluatorId} className="small" style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <span style={{ color: stage.status === "OK" ? "var(--contained)" : "var(--modified)" }}>
              {stage.status === "OK" ? "✓" : "✕"}
            </span>
            <span>{stage.label}</span>
            {stage.note && <span className="faint micro">{stage.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Failed({ evaluationId, error, canRetry, attempts }: { evaluationId: string; error: string | null; canRetry: boolean; attempts: number }) {
  return (
    <div className="panel" style={{ padding: "1.2rem", maxWidth: "44rem", borderColor: "var(--wide)" }}>
      <h2 style={{ fontSize: "var(--t-h3)" }}>The review did not finish</h2>
      <p className="dim small" style={{ margin: "0.3rem 0 0.6rem" }}>
        Your design is stored and unchanged. This failed after attempt {attempts}.
      </p>
      {error && <p className="small ident dim">{error}</p>}

      {canRetry ? (
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await fetch(`/api/evaluations/${evaluationId}/retry`, { method: "POST" });
            window.location.reload();
          }}
        >
          run it again
        </button>
      ) : (
        <p className="small faint">
          All retries used. A fourth would spend an API call to produce the same error.
        </p>
      )}
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
