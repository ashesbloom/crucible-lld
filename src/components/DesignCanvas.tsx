"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Diagram } from "@/components/Diagram";
import {
  DesignDocument,
  STEREOTYPES,
  RELATION_KINDS,
  type DesignDocumentInput,
  type Decision,
  type Entity,
  type Relation,
  type Stereotype,
  type RelationKind,
} from "@/domain/design/DesignDocument";
import { toMermaid } from "@/domain/design/MermaidEmitter";
import { uncoveredRequirements } from "@/domain/design/RequirementCoverage";

interface Props {
  attemptId: string;
  problemTitle: string;
  requirements: readonly string[];
  constraints: readonly string[];
  statement: string;
  initial: DesignDocumentInput;
}

type Tab = "classes" | "relationships" | "decisions" | "assumptions";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "classes", label: "classes" },
  { id: "relationships", label: "relationships" },
  { id: "decisions", label: "decisions" },
  { id: "assumptions", label: "assumptions" },
];

const STEREOTYPE_HINT: Record<Stereotype, string> = {
  ENTITY: "has identity and state",
  VALUE_OBJECT: "immutable, compared by value",
  SERVICE: "stateless behaviour",
  REPOSITORY: "persistence boundary",
  STRATEGY: "a swappable rule",
  FACTORY: "builds something complicated",
  INTERFACE: "a contract with no implementation",
  ENUM: "a fixed set of options",
  CONTROLLER: "the way in from outside",
};

const RELATION_HINT: Record<RelationKind, string> = {
  HAS_A: "owns or contains",
  IS_A: "is a kind of",
  USES: "calls or depends on",
  IMPLEMENTS: "fulfils the contract of",
};

export function DesignCanvas({ attemptId, problemTitle, requirements, constraints, statement, initial }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("classes");
  const [doc, setDoc] = useState<DesignDocumentInput>(initial);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entities = doc.entities ?? [];
  const relations = doc.relations ?? [];
  const decisions = doc.decisions ?? [];
  const assumptions = doc.assumptions ?? [];

  /* A design that briefly has two classes with the same id while someone is
     typing must not blank the diagram, so parsing failures keep the old one. */
  const parsed = useMemo(() => {
    try {
      return DesignDocument.create(doc);
    } catch {
      return null;
    }
  }, [doc]);

  const mermaid = useMemo(() => (parsed ? toMermaid(parsed) : ""), [parsed]);
  const uncovered = useMemo(
    () => new Set(parsed ? uncoveredRequirements(parsed, requirements) : requirements.map((_, i) => i)),
    [parsed, requirements],
  );

  /* Autosave. Keyed on the document, debounced, and every timer is cleared on
     the way out so a burst of typing leaves exactly one request behind. */
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    let cancelled = false;
    setSaving("saving");

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/attempts/${attemptId}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc),
        });
        if (!cancelled) setSaving(response.ok ? "saved" : "error");
      } catch {
        if (!cancelled) setSaving("error");
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, attemptId]);

  /* Generated once and reused, so a retry after a failed submit is recognised
     as the same submit rather than starting a second evaluation. */
  const submitKey = useRef<string>(`submit:${attemptId}:${crypto.randomUUID()}`);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submitKey.current },
        body: JSON.stringify(doc),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Submit failed.");
      router.push(`/attempt/${attemptId}/report?evaluation=${body.evaluationId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submit failed.");
      setSubmitting(false);
    }
  }

  function patch(update: Partial<DesignDocumentInput>) {
    setDoc((current) => ({ ...current, ...update }));
  }

  function addEntity() {
    const id = `e${Date.now().toString(36).slice(-5)}`;
    patch({
      entities: [
        ...entities,
        { id, name: "", stereotype: "ENTITY", responsibility: "", attributes: [], methods: [] },
      ],
    });
    setTab("classes");
  }

  function updateEntity(id: string, update: Partial<Entity>) {
    patch({ entities: entities.map((e) => (e.id === id ? { ...e, ...update } : e)) });
  }

  function removeEntity(id: string) {
    patch({
      entities: entities.filter((e) => e.id !== id),
      // Relationships to a deleted class would render as dangling, which the
      // evaluator correctly calls a mistake. Removing them is the honest fix.
      relations: relations.filter((r) => r.fromId !== id && r.toId !== id),
    });
  }

  const named = entities.filter((e) => e.name.trim().length > 0);
  const ready = named.length >= 2;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.95fr)", gap: "1.5rem", alignItems: "start" }}>
      <div>
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          {TABS.map((item) => {
            const count = { classes: entities.length, relationships: relations.length, decisions: decisions.length, assumptions: assumptions.length }[item.id];
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className="btn"
                aria-current={on}
                style={{
                  borderColor: on ? "var(--chalk)" : "var(--ink-600)",
                  color: on ? "var(--chalk)" : "var(--chalk-dim)",
                }}
              >
                {item.label}
                <span className="metric micro faint">{count}</span>
              </button>
            );
          })}
        </div>

        {tab === "classes" && (
          <div className="stack" style={{ ["--gap" as string]: "0.6rem" }}>
            {entities.length === 0 && (
              <Empty title="No classes yet" body="Start with the nouns in the brief." />
            )}

            {entities.map((entity) => (
              <EntityRow
                key={entity.id}
                entity={entity}
                onChange={(update) => updateEntity(entity.id, update)}
                onRemove={() => removeEntity(entity.id)}
              />
            ))}

            <button onClick={addEntity} className="btn btn-ghost">add a class</button>
          </div>
        )}

        {tab === "relationships" && (
          <RelationEditor
            entities={named}
            relations={relations}
            onChange={(next) => patch({ relations: next })}
          />
        )}

        {tab === "decisions" && (
          <DecisionEditor decisions={decisions} onChange={(next) => patch({ decisions: next })} />
        )}

        {tab === "assumptions" && (
          <ListEditor
            values={assumptions}
            placeholder="The brief does not say whether…"
            help="Ambiguities you resolved, and how."
            onChange={(next) => patch({ assumptions: next })}
          />
        )}
      </div>

      <aside style={{ position: "sticky", top: "1rem", display: "grid", gap: "0.8rem" }}>
        <div className="vellum" style={{ overflow: "hidden" }}>
          <div className="small" style={{ padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--ink-600)", display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
            <span>{problemTitle}</span>
            <span className="faint" style={{ fontWeight: 400 }}>{entities.length} classes</span>
          </div>
          {mermaid ? <Diagram source={mermaid} /> : <div className="diagram small faint">Add a class to start the drawing.</div>}
        </div>

        <details className="panel" style={{ padding: "0.7rem 0.8rem" }}>
          <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>the brief</summary>
          <p className="small dim" style={{ marginTop: "0.6rem" }}>{statement}</p>
          {constraints.length > 0 && (
            <ul className="small dim" style={{ paddingLeft: "1.1rem", margin: 0 }}>
              {constraints.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </details>

        <div className="panel" style={{ padding: "0.7rem 0.8rem" }}>
          <div className="small" style={{ fontWeight: 600, marginBottom: "0.5rem", display: "flex", justifyContent: "space-between" }}>
            <span>requirements</span>
            <span className="metric faint">{requirements.length - uncovered.size}/{requirements.length}</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
            {requirements.map((requirement, index) => {
              const covered = !uncovered.has(index);
              return (
                <li key={requirement} className="small" style={{ display: "grid", gridTemplateColumns: "1rem 1fr", gap: "0.5rem", color: covered ? "var(--chalk)" : "var(--chalk-faint)" }}>
                  <span aria-hidden style={{ color: covered ? "var(--contained)" : "var(--ink-500)" }}>
                    {covered ? "●" : "○"}
                  </span>
                  <span>{requirement}</span>
                </li>
              );
            })}
          </ul>
          <p className="micro faint" style={{ margin: "0.6rem 0 0" }}>
            Counts when something in your design mentions it. Same check the review runs.
          </p>
        </div>

        <div className="panel" style={{ padding: "0.7rem 0.8rem", display: "grid", gap: "0.6rem" }}>
          <div className="micro faint" aria-live="polite">
            {saving === "saving" && "Saving…"}
            {saving === "saved" && "Draft saved"}
            {saving === "error" && "Could not save the draft"}
            {saving === "idle" && "Autosaves as you type"}
          </div>

          <button onClick={submit} disabled={!ready || submitting} className="btn btn-primary" style={{ justifyContent: "center" }}>
            {submitting ? "Submitting…" : "Submit for review"}
          </button>

          {!ready && <p className="micro faint" style={{ margin: 0 }}>Name at least two classes first.</p>}
          {error && <p className="micro" style={{ margin: 0, color: "var(--wide)" }}>{error}</p>}
        </div>
      </aside>
    </div>
  );
}

function EntityRow({ entity, onChange, onRemove }: { entity: Entity; onChange: (u: Partial<Entity>) => void; onRemove: () => void }) {
  return (
    <div className="panel" style={{ padding: "0.7rem 0.8rem", display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 12rem auto", gap: "0.5rem" }}>
        <input
          className="field ident"
          value={entity.name}
          placeholder="ClassName"
          aria-label="Class name"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <select className="field" value={entity.stereotype} aria-label="Stereotype" onChange={(e) => onChange({ stereotype: e.target.value as Stereotype })}>
          {STEREOTYPES.map((s) => (
            <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>
          ))}
        </select>
        <button onClick={onRemove} className="btn btn-quiet" aria-label={`Remove ${entity.name || "class"}`}>remove</button>
      </div>

      <input
        className="field"
        value={entity.responsibility}
        placeholder={`One sentence: ${STEREOTYPE_HINT[entity.stereotype]}`}
        aria-label="Responsibility"
        onChange={(e) => onChange({ responsibility: e.target.value })}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <input
          className="field ident"
          value={entity.attributes.join(", ")}
          placeholder="attributes, comma separated"
          aria-label="Attributes"
          onChange={(e) => onChange({ attributes: splitList(e.target.value) })}
        />
        <input
          className="field ident"
          value={entity.methods.join(", ")}
          placeholder="methods(), comma separated"
          aria-label="Methods"
          onChange={(e) => onChange({ methods: splitList(e.target.value) })}
        />
      </div>
    </div>
  );
}

function RelationEditor({ entities, relations, onChange }: { entities: readonly Entity[]; relations: readonly Relation[]; onChange: (next: Relation[]) => void }) {
  if (entities.length < 2) {
    return <Empty title="Name two classes first" body="Relationships connect classes, so there is nothing to connect yet." />;
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
      {relations.length === 0 && (
        <Empty title="No relationships yet" body="A class connected to nothing gets flagged in review." />
      )}

      {relations.map((relation, index) => (
        <div key={index} className="panel" style={{ padding: "0.5rem 0.6rem", display: "grid", gridTemplateColumns: "1fr 10rem 1fr auto", gap: "0.5rem", alignItems: "center" }}>
          <select className="field ident" value={relation.fromId} aria-label="From" onChange={(e) => onChange(replace(relations, index, { fromId: e.target.value }))}>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
          <select className="field" value={relation.kind} aria-label="Relationship" onChange={(e) => onChange(replace(relations, index, { kind: e.target.value as RelationKind }))}>
            {RELATION_KINDS.map((kind) => (
              <option key={kind} value={kind}>{RELATION_HINT[kind]}</option>
            ))}
          </select>
          <select className="field ident" value={relation.toId} aria-label="To" onChange={(e) => onChange(replace(relations, index, { toId: e.target.value }))}>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
          <button className="btn btn-quiet" onClick={() => onChange(relations.filter((_, i) => i !== index))} aria-label="Remove relationship">remove</button>
        </div>
      ))}

      <button
        className="btn btn-ghost"
        onClick={() => onChange([...relations, { fromId: entities[0]!.id, toId: entities[1]!.id, kind: "USES" }])}
      >
        add a relationship
      </button>
    </div>
  );
}

function DecisionEditor({ decisions, onChange }: { decisions: readonly Decision[]; onChange: (next: Decision[]) => void }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
      {decisions.length === 0 && (
        <Empty
          title="No decisions recorded"
          body="A decision with no rejected alternative is usually a default nobody examined."
        />
      )}

      {decisions.map((decision, index) => (
        <div key={index} className="panel" style={{ padding: "0.7rem 0.8rem", display: "grid", gap: "0.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem" }}>
            <input className="field" value={decision.title} placeholder="What you decided" aria-label="Decision" onChange={(e) => onChange(replace(decisions, index, { title: e.target.value }))} />
            <button className="btn btn-quiet" onClick={() => onChange(decisions.filter((_, i) => i !== index))} aria-label="Remove decision">remove</button>
          </div>
          <textarea className="field" rows={2} value={decision.rationale} placeholder="Why this way" aria-label="Rationale" onChange={(e) => onChange(replace(decisions, index, { rationale: e.target.value }))} />
          <input className="field" value={decision.alternativeRejected} placeholder="What you turned down" aria-label="Alternative rejected" onChange={(e) => onChange(replace(decisions, index, { alternativeRejected: e.target.value }))} />
        </div>
      ))}

      <button className="btn btn-ghost" onClick={() => onChange([...decisions, { title: "", rationale: "", alternativeRejected: "" }])}>
        add a decision
      </button>
    </div>
  );
}

function ListEditor({ values, placeholder, help, onChange }: { values: readonly string[]; placeholder: string; help: string; onChange: (next: string[]) => void }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
      <p className="small dim" style={{ margin: 0 }}>{help}</p>
      {values.map((value, index) => (
        <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem" }}>
          <input className="field" value={value} placeholder={placeholder} aria-label={`Assumption ${index + 1}`} onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))} />
          <button className="btn btn-quiet" onClick={() => onChange(values.filter((_, i) => i !== index))} aria-label="Remove">remove</button>
        </div>
      ))}
      <button className="btn btn-ghost" onClick={() => onChange([...values, ""])}>add an assumption</button>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel-quiet" style={{ padding: "0.9rem 1rem" }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <p className="small dim" style={{ margin: "0.2rem 0 0", maxWidth: "50ch" }}>{body}</p>
    </div>
  );
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function replace<T>(items: readonly T[], index: number, update: Partial<T>): T[] {
  return items.map((item, i) => (i === index ? { ...item, ...update } : item));
}
