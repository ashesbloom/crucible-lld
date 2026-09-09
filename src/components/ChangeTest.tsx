"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Diagram } from "@/components/Diagram";
import { useEvaluationStatus, type EvaluationView } from "@/components/useEvaluationStatus";
import {
  DesignDocument,
  STEREOTYPES,
  type DesignDocumentInput,
  type Entity,
  type Stereotype,
} from "@/domain/design/DesignDocument";
import { toMermaid } from "@/domain/design/MermaidEmitter";
import type { ChangeTestResponse, EntityImpact, ImpactVerdict } from "@/domain/evaluation/BlastRadius";

gsap.registerPlugin(useGSAP);

interface Props {
  attemptId: string;
  document: DesignDocumentInput;
  requirement: string;
  framing: string;
  parBlastRadius: number;
  answeredEvaluationId: string | null;
  answeredEvaluation: EvaluationView | null;
  previousResponse: ChangeTestResponse | null;
}

export function ChangeTest(props: Props) {
  return props.answeredEvaluationId ? <Result {...props} /> : <Answer {...props} />;
}

/* -------------------------------------------------------------------------- */

function Answer({ attemptId, document, requirement, framing }: Props) {
  const parsed = useMemo(() => DesignDocument.create(document), [document]);

  const [verdicts, setVerdicts] = useState<Record<string, ImpactVerdict>>(() =>
    Object.fromEntries(parsed.entities.map((e) => [e.id, "UNCHANGED" as ImpactVerdict])),
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Entity[]>([]);
  const [narrative, setNarrative] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const impacts: EntityImpact[] = parsed.entities.map((entity) => ({
    entityId: entity.id,
    verdict: verdicts[entity.id] ?? "UNCHANGED",
    rationale: reasons[entity.id] ?? "",
  }));

  const modified = impacts.filter((i) => i.verdict === "MODIFIED").length;
  const touched = modified + added.length;
  const radius = touched / (parsed.entityCount + added.length);

  const preview = useMemo(() => {
    const map = new Map<string, ImpactVerdict>(impacts.map((i) => [i.entityId, i.verdict]));
    return toMermaid(parsed, { impacts: map });
  }, [parsed, impacts]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/attempts/${attemptId}/change-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `change-test:${attemptId}` },
        body: JSON.stringify({ impacts, newEntities: added, narrative } satisfies ChangeTestResponse),
      });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Submit failed.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submit failed.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.85fr)", gap: "1.5rem", alignItems: "start" }}>
      <div className="stack" style={{ ["--gap" as string]: "1rem" }}>
        <div className="panel" style={{ padding: "0.9rem 1rem", borderColor: "var(--modified)" }}>
          <span className="chip impact-modified">new requirement</span>
          <p style={{ fontWeight: 600, margin: "0.5rem 0 0", maxWidth: "60ch" }}>
            {requirement}
          </p>
          <p className="small faint" style={{ margin: "0.4rem 0 0" }}>{framing}</p>
        </div>

        <div className="panel" style={{ padding: "0.9rem 1rem" }}>
          <h2 style={{ fontSize: "var(--t-h4)" }}>Which of your classes does this force open?</h2>
          <p className="small dim" style={{ margin: "0.3rem 0 0.9rem", maxWidth: "60ch" }}>
            Be honest. Under-reporting is checked.
          </p>

          <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
            {parsed.entities.map((entity) => {
              const verdict = verdicts[entity.id] ?? "UNCHANGED";
              return (
                <div
                  key={entity.id}
                  className="panel-quiet"
                  style={{ padding: "0.5rem 0.6rem", display: "grid", gap: "0.4rem" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <span className="ident" style={{ fontWeight: 600 }}>{entity.name}</span>
                      <span className="micro faint" style={{ marginLeft: "0.5rem" }}>
                        {entity.responsibility || "no responsibility stated"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <VerdictButton
                        active={verdict === "UNCHANGED"}
                        tone="impact-unchanged"
                        onClick={() => setVerdicts({ ...verdicts, [entity.id]: "UNCHANGED" })}
                      >
                        untouched
                      </VerdictButton>
                      <VerdictButton
                        active={verdict === "MODIFIED"}
                        tone="impact-modified"
                        onClick={() => setVerdicts({ ...verdicts, [entity.id]: "MODIFIED" })}
                      >
                        must change
                      </VerdictButton>
                    </div>
                  </div>

                  <input
                    className="field"
                    placeholder={verdict === "MODIFIED" ? "What has to change in here?" : "Why does this one get away with it?"}
                    aria-label={`Reason for ${entity.name}`}
                    value={reasons[entity.id] ?? ""}
                    onChange={(e) => setReasons({ ...reasons, [entity.id]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{ padding: "0.9rem 1rem" }}>
          <h2 style={{ fontSize: "var(--t-h4)" }}>Anything new</h2>
          <p className="small dim" style={{ margin: "0.3rem 0 0.8rem" }}>
            New classes count toward the blast radius, so ten of them is not a free answer.
          </p>

          <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
            {added.map((entity, index) => (
              <div key={entity.id} style={{ display: "grid", gridTemplateColumns: "1fr 11rem auto", gap: "0.5rem" }}>
                <input
                  className="field ident"
                  value={entity.name}
                  placeholder="NewClassName"
                  aria-label="New class name"
                  onChange={(e) => setAdded(added.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))}
                />
                <select
                  className="field"
                  value={entity.stereotype}
                  aria-label="Stereotype"
                  onChange={(e) => setAdded(added.map((x, i) => (i === index ? { ...x, stereotype: e.target.value as Stereotype } : x)))}
                >
                  {STEREOTYPES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
                </select>
                <button className="btn btn-quiet" onClick={() => setAdded(added.filter((_, i) => i !== index))}>Remove</button>
              </div>
            ))}

            <button
              className="btn btn-ghost"
              onClick={() =>
                setAdded([
                  ...added,
                  { id: `n${Date.now().toString(36).slice(-5)}`, name: "", stereotype: "STRATEGY", responsibility: "", attributes: [], methods: [] },
                ])
              }
            >
              Add a class
            </button>
          </div>
        </div>

        <div className="panel" style={{ padding: "0.9rem 1rem" }}>
          <h2 style={{ fontSize: "var(--t-h4)" }}>In a sentence, where does it land?</h2>
          <textarea
            className="field"
            rows={3}
            style={{ marginTop: "0.5rem" }}
            value={narrative}
            aria-label="Where the change lands"
            placeholder="The new rule is another implementation of…"
            onChange={(e) => setNarrative(e.target.value)}
          />
        </div>

        {error && <p className="small" style={{ color: "var(--wide)" }}>{error}</p>}
      </div>

      <aside style={{ position: "sticky", top: "1rem", display: "grid", gap: "0.8rem" }}>
        <div className="vellum">
          <div className="small" style={{ padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--ink-600)", fontWeight: 600 }}>
            Your design, as you mark it
          </div>
          <Diagram source={preview} />
        </div>

        <div className="panel" style={{ padding: "0.9rem 1rem", display: "grid", gap: "0.6rem" }}>
          <div>
            <div className="metric" style={{ fontSize: "var(--t-h2)", fontWeight: 600 }}>
              {Math.round(radius * 100)}%
            </div>
            <div className="small dim">
              {touched} of {parsed.entityCount + added.length} classes touched
            </div>
          </div>

          <button onClick={submit} disabled={submitting} className="btn btn-primary" style={{ justifyContent: "center" }}>
            {submitting ? "Scoring…" : "Score the change test"}
          </button>

          <p className="micro faint" style={{ margin: 0 }}>
            Par is revealed once you commit.
          </p>
        </div>
      </aside>
    </div>
  );
}

function VerdictButton({ active, tone, onClick, children }: { active: boolean; tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`chip ${active ? tone : ""}`}
      style={{ cursor: "pointer", opacity: active ? 1 : 0.5, background: active ? undefined : "transparent" }}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function Result({ attemptId, document, requirement, answeredEvaluationId, answeredEvaluation, previousResponse }: Props) {
  const view = useEvaluationStatus(answeredEvaluationId, { initial: answeredEvaluation });
  const parsed = useMemo(() => DesignDocument.create(document), [document]);
  const diagram = useRef<HTMLDivElement>(null);

  // The one animation on this page. Mermaid paints the whole diagram at once,
  // which loses the thing the round is about: most of the design sat still and
  // a few classes had to move. So the touched nodes land after the rest.
  const { contextSafe } = useGSAP({ scope: diagram });

  const landChange = contextSafe(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const touched = diagram.current?.querySelectorAll("svg g.modified, svg g.new");
    if (!touched?.length) return;
    gsap.from(touched, {
      autoAlpha: 0,
      scale: 0.9,
      transformOrigin: "center",
      duration: 0.32,
      stagger: 0.09,
      ease: "power2.out",
    });
  });

  const mermaid = useMemo(() => {
    const map = new Map<string, ImpactVerdict>(
      (previousResponse?.impacts ?? []).map((i) => [i.entityId, i.verdict]),
    );
    return toMermaid(parsed, { impacts: map });
  }, [parsed, previousResponse]);

  if (!view || view.status === "QUEUED" || view.status === "RUNNING") {
    return <div className="panel" style={{ padding: "1.2rem" }}>Scoring the change test…</div>;
  }

  const blast = view.report?.blastRadius;
  if (!blast) {
    return (
      <div className="panel" style={{ padding: "1.2rem", borderColor: "var(--wide)" }}>
        <h2 style={{ fontSize: "var(--t-h3)" }}>The change test did not finish</h2>
        <p className="dim small">{view.error ?? "No result was produced."}</p>
      </div>
    );
  }

  const pct = Math.round(blast.radius * 100);
  const parPct = Math.round(blast.par * 100);
  const tone = blast.band === "CONTAINED" ? "var(--contained)" : blast.band === "MODERATE" ? "var(--modified)" : "var(--wide)";
  const findings = view.report?.findings.filter((f) => f.criterionId === "extensibility") ?? [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.85fr)", gap: "1.5rem", alignItems: "start" }}>
      <div className="stack" style={{ ["--gap" as string]: "1rem" }}>
        <div className="panel" style={{ padding: "0.9rem 1rem", borderColor: tone }}>
          <span className="chip" style={{ ["--impact" as string]: tone, ["--impact-dim" as string]: `color-mix(in oklab, ${tone} 10%, #fff)` }}>
            {blast.band.toLowerCase()}
          </span>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", marginTop: "0.7rem", flexWrap: "wrap" }}>
            <span className="metric" style={{ fontSize: "var(--t-display)", lineHeight: 1, color: tone }}>{pct}%</span>
            <div className="small dim">
              of your design had to change
              <div className="micro faint">
                {blast.modifiedCount} edited · {blast.newCount} added · {blast.unchangedCount} untouched
              </div>
            </div>
          </div>

          {/* A measured comparison, drawn as one. Par is the only number here
              that came from the problem author rather than from the answer. */}
          <div style={{ marginTop: "1rem" }}>
            <div style={{ position: "relative", height: 20 }}>
              <div style={{ position: "absolute", inset: "7px 0 auto", height: 6, background: "var(--ink-600)" }} />
              <div style={{ position: "absolute", inset: "7px auto auto 0", height: 6, width: `${Math.min(pct, 100)}%`, background: tone }} />
              <div style={{ position: "absolute", left: `${Math.min(parPct, 100)}%`, top: 0, bottom: 0, borderLeft: "2px dashed var(--chalk)" }} />
            </div>
            <div className="micro faint" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>yours {pct}%</span>
              <span>par {parPct}%</span>
            </div>
          </div>

          <p className="small dim" style={{ margin: "0.9rem 0 0", maxWidth: "62ch" }}>{requirement}</p>
        </div>

        <div className="panel" style={{ padding: "0.9rem 1rem" }}>
          <h2 style={{ fontSize: "var(--t-h4)" }}>Did the design have somewhere to put it?</h2>
          <div className="stack" style={{ ["--gap" as string]: "0.5rem", marginTop: "0.7rem" }}>
            {blast.seams.map((seam) => (
              <div key={seam.seam.id} style={{ display: "grid", gridTemplateColumns: "1rem 1fr", gap: "0.5rem" }}>
                <span style={{ color: seam.satisfied ? "var(--contained)" : "var(--wide)" }} aria-hidden>
                  {seam.satisfied ? "●" : "○"}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {seam.seam.label}
                    {seam.matchedEntityName && (
                      <span className="ident micro faint" style={{ marginLeft: "0.5rem" }}>{seam.matchedEntityName}</span>
                    )}
                  </div>
                  <p className="small dim" style={{ margin: "0.15rem 0 0" }}>
                    {seam.satisfied ? "There was already a seam here, so the change had a home." : seam.seam.explanation}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {findings.filter((f) => f.source === "LLM").length > 0 && (
          <div className="panel" style={{ padding: "0.9rem 1rem", borderColor: "var(--added)" }}>
            <h2 style={{ fontSize: "var(--t-h4)" }}>The model disagrees with some of your tagging</h2>
            <p className="small faint" style={{ margin: "0.2rem 0 0.7rem" }}>
              Its only job this round: check claims that something needs no change.
            </p>
            {findings.filter((f) => f.source === "LLM").map((finding, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 0 : "0.6rem" }}>
                <div style={{ fontWeight: 600 }}>{finding.headline}</div>
                <p className="small dim" style={{ margin: "0.2rem 0 0" }}>{finding.concern}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/problems" className="btn btn-ghost">try again</Link>
          <Link href={`/attempt/${attemptId}/report`} className="btn btn-ghost">back to the review</Link>
          <Link href="/history" className="btn btn-ghost">history</Link>
        </div>
      </div>

      <aside style={{ position: "sticky", top: "1rem" }}>
        <div className="vellum" ref={diagram}>
          <div className="small" style={{ padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--ink-600)", fontWeight: 600 }}>
            Where the change landed
          </div>
          <Diagram source={mermaid} onRendered={landChange} />
          <div style={{ display: "flex", gap: "0.35rem", padding: "0 0.6rem 0.6rem", flexWrap: "wrap" }}>
            <span className="chip impact-unchanged">untouched</span>
            <span className="chip impact-modified">had to change</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
