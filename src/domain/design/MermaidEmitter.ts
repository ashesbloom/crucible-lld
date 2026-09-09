/**
 * Renders a DesignDocument as a Mermaid class diagram.
 *
 * This is the payoff for making the submission structured. The learner fills a
 * form and a diagram appears, and the diagram is not a second artefact that can
 * drift - it is the same object the evaluators read, drawn differently. That is
 * also the honest answer to "what if we later accept diagrams instead of text":
 * the diagram is already a view, so the work is a parser, not a redesign.
 *
 * Layout is Mermaid's problem. Writing our own would be days of work to end up
 * somewhere worse.
 */

import type { DesignDocument, RelationKind } from "./DesignDocument";
import type { ImpactVerdict } from "../evaluation/BlastRadius";

/** Mermaid's class-diagram arrows, closest match for each relation kind. */
const ARROWS: Record<RelationKind, string> = {
  HAS_A: "*--",
  IS_A: "<|--",
  USES: "-->",
  IMPLEMENTS: "<|..",
};

/** IS_A and IMPLEMENTS read parent-first in Mermaid; the others read child-first. */
const REVERSED: ReadonlySet<RelationKind> = new Set<RelationKind>(["IS_A", "IMPLEMENTS"]);

export interface EmitOptions {
  /** Change-test colouring. Absent on the first round. */
  readonly impacts?: ReadonlyMap<string, ImpactVerdict>;
  /** Ids to ring, e.g. the classes an evidence chip is pointing at. */
  readonly highlighted?: ReadonlySet<string>;
}

/** Mermaid identifiers cannot carry the punctuation a generated id might. */
function safeId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `c_${cleaned}`;
}

function escapeLabel(text: string): string {
  return text.replace(/[{}"|]/g, "").replace(/\s+/g, " ").trim();
}

export function toMermaid(document: DesignDocument, options: EmitOptions = {}): string {
  if (document.isEmpty()) {
    return "classDiagram\n  class EmptyDesign {\n    +addYourFirstClass()\n  }";
  }

  const lines: string[] = ["classDiagram"];

  for (const entity of document.entities) {
    const id = safeId(entity.id);
    lines.push(`  class ${id}["${escapeLabel(entity.name)}"] {`);
    lines.push(`    <<${entity.stereotype.toLowerCase().replace("_", " ")}>>`);
    for (const attribute of entity.attributes.slice(0, 6)) {
      lines.push(`    +${escapeLabel(attribute)}`);
    }
    for (const method of entity.methods.slice(0, 8)) {
      const name = escapeLabel(method);
      lines.push(`    +${name.endsWith(")") ? name : `${name}()`}`);
    }
    lines.push("  }");
  }

  for (const relation of document.relations) {
    if (!document.hasEntity(relation.fromId) || !document.hasEntity(relation.toId)) continue;
    const from = safeId(relation.fromId);
    const to = safeId(relation.toId);
    const arrow = ARROWS[relation.kind];
    const label = relation.label ? ` : ${escapeLabel(relation.label)}` : "";
    lines.push(REVERSED.has(relation.kind) ? `  ${to} ${arrow} ${from}${label}` : `  ${from} ${arrow} ${to}${label}`);
  }

  // Impact colouring is what makes the change-test result readable at a glance:
  // green survived, amber had to be edited, blue is new.
  if (options.impacts) {
    for (const entity of document.entities) {
      const verdict = options.impacts.get(entity.id);
      if (verdict) lines.push(`  cssClass "${safeId(entity.id)}" ${verdict.toLowerCase()}`);
    }
  }

  if (options.highlighted) {
    for (const id of options.highlighted) {
      if (document.hasEntity(id)) lines.push(`  cssClass "${safeId(id)}" highlighted`);
    }
  }

  return lines.join("\n");
}
