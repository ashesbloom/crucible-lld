import Link from "next/link";
import { Diagram } from "@/components/Diagram";
import { DesignDocument } from "@/domain/design/DesignDocument";
import { toMermaid } from "@/domain/design/MermaidEmitter";
import type { ImpactVerdict } from "@/domain/evaluation/BlastRadius";

/* Two designs of the same problem, both defensible, drawn from the same model
   the evaluators read. The difference is where fee calculation lives. */

const inlined = DesignDocument.create({
  entities: [
    { id: "lot", name: "ParkingLot", stereotype: "ENTITY", responsibility: "Allocates spots and calculates fees.", attributes: [], methods: ["park()", "calculateFee()"] },
    { id: "spot", name: "Spot", stereotype: "ENTITY", responsibility: "One place to park.", attributes: ["size"], methods: [] },
    { id: "ticket", name: "Ticket", stereotype: "ENTITY", responsibility: "Entry record.", attributes: ["issuedAt"], methods: [] },
    { id: "vehicle", name: "Vehicle", stereotype: "ENTITY", responsibility: "What is parked.", attributes: ["size"], methods: [] },
  ],
  relations: [
    { fromId: "lot", toId: "spot", kind: "HAS_A" },
    { fromId: "lot", toId: "ticket", kind: "USES" },
    { fromId: "ticket", toId: "vehicle", kind: "USES" },
  ],
});

const separated = DesignDocument.create({
  entities: [
    { id: "lot", name: "ParkingLot", stereotype: "ENTITY", responsibility: "Allocates and releases spots.", attributes: [], methods: ["park()", "release()"] },
    { id: "spot", name: "Spot", stereotype: "ENTITY", responsibility: "One place to park.", attributes: ["size"], methods: [] },
    { id: "ticket", name: "Ticket", stereotype: "ENTITY", responsibility: "Entry record.", attributes: ["issuedAt"], methods: [] },
    { id: "vehicle", name: "Vehicle", stereotype: "ENTITY", responsibility: "What is parked.", attributes: ["size"], methods: [] },
    { id: "pricing", name: "PricingStrategy", stereotype: "INTERFACE", responsibility: "Prices a completed stay.", attributes: [], methods: ["feeFor()"] },
    { id: "hourly", name: "HourlyPricing", stereotype: "STRATEGY", responsibility: "Flat rate per hour.", attributes: [], methods: ["feeFor()"] },
  ],
  relations: [
    { fromId: "lot", toId: "spot", kind: "HAS_A" },
    { fromId: "lot", toId: "ticket", kind: "USES" },
    { fromId: "ticket", toId: "vehicle", kind: "USES" },
    { fromId: "lot", toId: "pricing", kind: "USES" },
    { fromId: "hourly", toId: "pricing", kind: "IMPLEMENTS" },
  ],
});

const inlinedImpact = new Map<string, ImpactVerdict>([
  ["lot", "MODIFIED"], ["spot", "MODIFIED"], ["ticket", "MODIFIED"], ["vehicle", "UNCHANGED"],
]);

const separatedImpact = new Map<string, ImpactVerdict>([
  ["lot", "UNCHANGED"], ["spot", "MODIFIED"], ["ticket", "UNCHANGED"],
  ["vehicle", "UNCHANGED"], ["pricing", "UNCHANGED"], ["hourly", "UNCHANGED"],
]);

const LOOP = [
  "pick a problem",
  "design it — the diagram draws itself",
  "submit",
  "read the review — six criteria, evidence on each",
  "change test — a requirement you have not seen",
];

const COUNTED = ["requirement coverage", "extensibility"];
const JUDGED = ["responsibility clarity", "abstraction", "coupling", "reasoning quality"];

export default function Home() {
  return (
    <div className="shell" style={{ padding: "2.5rem 0 3rem" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Crucible</h1>

      <p style={{ marginTop: "0.8rem", maxWidth: "62ch" }}>
        Every LLD tool grades the design you wrote.
        <br />
        Several designs are correct, so that question has no answer.
        <br />
        This one changes the requirements and measures what breaks.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link href="/problems" className="btn btn-primary">[ start ]</Link>
        <Link href="/tour" className="btn btn-ghost">[ tour ]</Link>
      </div>

      <hr className="rule" style={{ margin: "2.5rem 0 1.5rem" }} />

      <p className="small dim" style={{ maxWidth: "62ch" }}>
        Same problem, two correct designs, one new requirement: add electric vehicle bays,
        billed per minute.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
        <DesignCard
          label="fee logic inside ParkingLot"
          source={toMermaid(inlined, { impacts: inlinedImpact })}
          touched={3}
          total={5}
          band="WIDE"
        />
        <DesignCard
          label="fee logic behind an interface"
          source={toMermaid(separated, { impacts: separatedImpact })}
          touched={2}
          total={7}
          band="CONTAINED"
        />
      </div>

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.8rem" }}>
        <span className="chip impact-unchanged">untouched</span>
        <span className="chip impact-modified">had to change</span>
        <span className="chip impact-new">newly written</span>
      </div>

      <p className="small dim" style={{ marginTop: "0.8rem", maxWidth: "62ch" }}>
        Neither is wrong. The one on the right had somewhere to put the change.
      </p>

      <hr className="rule" style={{ margin: "2.5rem 0 1.5rem" }} />

      <h2 style={{ fontSize: "var(--t-h3)" }}>The loop</h2>
      <ol style={{ listStyle: "none", padding: 0, margin: "0.8rem 0 0" }}>
        {LOOP.map((step, index) => (
          <li key={step} style={{ display: "flex", gap: "0.8rem", padding: "0.15rem 0" }}>
            <span className="metric faint small">{String(index + 1).padStart(2, "0")}</span>
            <span className="small">{step}</span>
          </li>
        ))}
      </ol>

      <hr className="rule" style={{ margin: "2.5rem 0 1.5rem" }} />

      <h2 style={{ fontSize: "var(--t-h3)" }}>What the model does not decide</h2>
      <dl className="small" style={{ margin: "0.8rem 0 0", display: "grid", gridTemplateColumns: "8rem 1fr", gap: "0.3rem 1rem" }}>
        <dt className="dim">counted</dt>
        <dd style={{ margin: 0 }}>{COUNTED.join(", ")}</dd>
        <dt className="dim">judged</dt>
        <dd style={{ margin: 0 }}>{JUDGED.join(", ")}</dd>
      </dl>
      <p className="small dim" style={{ marginTop: "0.8rem" }}>
        Every criterion in the report says which. <Link href="/design">Design note</Link>.
      </p>
    </div>
  );
}

function DesignCard({
  label, source, touched, total, band,
}: { label: string; source: string; touched: number; total: number; band: "WIDE" | "CONTAINED" }) {
  const pct = Math.round((touched / total) * 100);

  return (
    <figure className="panel" style={{ margin: 0 }}>
      <figcaption className="small ident" style={{ padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--ink-600)" }}>
        {label}
      </figcaption>

      <Diagram source={source} />

      <div className="small" style={{ padding: "0.4rem 0.6rem", borderTop: "1px solid var(--ink-600)" }}>
        <span className="metric" style={{ color: band === "WIDE" ? "var(--wide)" : "var(--contained)" }}>
          {pct}% changed
        </span>
        <span className="dim"> · {touched} of {total} classes</span>
      </div>
    </figure>
  );
}
