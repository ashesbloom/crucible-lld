/**
 * The judgement pass.
 *
 * Three things about this class are load-bearing.
 *
 * 1. It never asks "is this a good design?". It asks, per criterion, which of
 *    four written descriptors the submission matches. The descriptors are the
 *    rubric's own text, passed through verbatim, so the model is choosing
 *    between anchors rather than inventing a scale.
 *
 * 2. Output is schema-constrained through tool use rather than parsed out of
 *    prose. The first version called JSON.parse on the response text and broke
 *    on the third run when the model wrapped its answer in a fenced code block.
 *    Stripping fences with a regex would have worked until the next surprise.
 *
 * 3. Everything that comes back is validated. Schema constraints guarantee the
 *    shape, not the contents: the model can still return a criterion id that
 *    does not exist or cite a class the learner never wrote. Unknown criteria
 *    are dropped here, and unresolvable evidence is dropped downstream by
 *    EvidenceResolver.
 */

import type { DesignDocument } from "../design/DesignDocument";
import type { EvaluationContext, Evaluator, EvaluatorOutput } from "../evaluation/Evaluator";
import type { Confidence, Finding } from "../evaluation/Finding";
import type { LlmClient } from "../ports/index";
import { LEVELS, type Criterion, type LevelId, type Rubric } from "../rubric/Rubric";

interface RawAssessment {
  criterionId?: unknown;
  level?: unknown;
  headline?: unknown;
  evidenceEntityIds?: unknown;
  concern?: unknown;
  suggestion?: unknown;
  confidence?: unknown;
}

export class LlmRubricEvaluator implements Evaluator {
  readonly id = "llm-rubric";
  readonly label = "Rubric review";
  readonly criteria = ["responsibility-clarity", "abstraction", "coupling-cohesion", "reasoning"];

  constructor(private readonly llm: LlmClient) {}

  /** Only the criteria this rubric hands to a model. */
  private judgementCriteria(rubric: Rubric): readonly Criterion[] {
    return rubric.criteria.filter((c) => c.authoritativeSource === "LLM");
  }

  supports(context: EvaluationContext): boolean {
    return (
      this.llm.available &&
      context.kind === "INITIAL" &&
      !context.document.isEmpty() &&
      this.judgementCriteria(context.rubric).length > 0
    );
  }

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutput> {
    const criteria = this.judgementCriteria(context.rubric);

    const request = this.request(context, criteria);

    // One repair attempt. Transient overloads are common enough to be worth a
    // second go; a second failure is a real outage, and retrying past that just
    // spends money to produce the same error. The pipeline catches what escapes.
    let raw: unknown;
    try {
      raw = await this.llm.requestStructured(request);
    } catch {
      raw = await this.llm.requestStructured(request);
    }

    const findings = this.validate(raw, criteria, context.document);

    if (findings.length === 0) {
      throw new Error("The model returned no usable assessments.");
    }

    return {
      findings,
      note: `${findings.length} of ${criteria.length} criteria assessed`,
    };
  }

  private request(context: EvaluationContext, criteria: readonly Criterion[]) {
    const { problem, document } = context;

    return {
      system: [
        "You assess a software design against a fixed rubric.",
        "For each criterion you are given four descriptors. Choose the single descriptor the submission matches. Do not invent a scale, do not average, and do not award a level the submission has not earned because it is close.",
        "There is no reference solution. Several different class layouts can all be correct. Judge only against the descriptors.",
        "Every criticism must cite the id of a class that appears in the submission. If you cannot cite one, do not make the point.",
      ].join("\n"),
      toolName: "record_assessment",
      toolDescription: "Record one assessment per rubric criterion.",
      maxTokens: 4096,
      schema: this.schema(criteria),
      prompt: [
        `# Problem: ${problem.title}`,
        problem.statement,
        "",
        "## Requirements given to the learner",
        ...problem.requirements.map((r, i) => `${i}. ${r}`),
        "",
        "## Rubric",
        ...criteria.map((c) =>
          [
            `### ${c.id} - ${c.name}`,
            c.question,
            ...c.levels.map((l) => `- ${l.level}: ${l.descriptor}`),
          ].join("\n"),
        ),
        "",
        "## Submission",
        serialiseDesign(document),
      ].join("\n"),
    };
  }

  private schema(criteria: readonly Criterion[]): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        assessments: {
          type: "array",
          description: "Exactly one entry per criterion listed in the prompt.",
          items: {
            type: "object",
            properties: {
              // Order matters. The model generates these fields in sequence, so
              // committing to a level before writing the prose stops the prose
              // from talking it into a different number.
              criterionId: { type: "string", enum: criteria.map((c) => c.id) },
              level: { type: "string", enum: [...LEVELS] },
              headline: { type: "string", description: "The verdict in one line, under 90 characters." },
              evidenceEntityIds: {
                type: "array",
                description: "Ids of classes from the submission that justify this level. Use ids exactly as given.",
                items: { type: "string" },
              },
              concern: { type: "string", description: "What is wrong or risky. Empty string if nothing is." },
              suggestion: { type: "string", description: "One concrete thing to do differently next attempt." },
              confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            },
            required: ["criterionId", "level", "headline", "evidenceEntityIds", "concern", "suggestion", "confidence"],
          },
        },
      },
      required: ["assessments"],
    };
  }

  /**
   * The trust boundary. Anything that does not survive this is discarded rather
   * than coerced into something plausible-looking.
   */
  private validate(
    raw: unknown,
    criteria: readonly Criterion[],
    document: DesignDocument,
  ): readonly Finding[] {
    const assessments = (raw as { assessments?: unknown })?.assessments;
    if (!Array.isArray(assessments)) return [];

    const known = new Set(criteria.map((c) => c.id));
    const levels = new Set<string>(LEVELS);
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const entry of assessments as RawAssessment[]) {
      const criterionId = typeof entry?.criterionId === "string" ? entry.criterionId : null;
      const level = typeof entry?.level === "string" ? entry.level : null;

      if (!criterionId || !known.has(criterionId)) continue;
      if (!level || !levels.has(level)) continue;
      if (seen.has(criterionId)) continue;
      seen.add(criterionId);

      const ids = Array.isArray(entry.evidenceEntityIds) ? entry.evidenceEntityIds : [];

      findings.push({
        criterionId,
        level: level as LevelId,
        source: "LLM",
        evaluatorId: this.id,
        headline: text(entry.headline, 140),
        evidence: ids
          .filter((id): id is string => typeof id === "string" && document.hasEntity(id))
          .map((id) => ({ kind: "ENTITY" as const, id })),
        concern: text(entry.concern, 600),
        suggestion: text(entry.suggestion, 400),
        confidence: confidence(entry.confidence),
      });
    }

    return findings;
  }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function confidence(value: unknown): Confidence {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW" ? value : "MEDIUM";
}

/** Plain text rather than raw JSON: it reads better to a model and costs fewer tokens. */
function serialiseDesign(document: DesignDocument): string {
  const lines: string[] = [];

  if (document.assumptions.length > 0) {
    lines.push("Assumptions:");
    document.assumptions.forEach((a, i) => lines.push(`  ${i}. ${a}`));
  }

  lines.push("", "Classes:");
  for (const e of document.entities) {
    lines.push(`  [id=${e.id}] ${e.name} <<${e.stereotype}>>`);
    lines.push(`    responsibility: ${e.responsibility || "(none stated)"}`);
    if (e.attributes.length) lines.push(`    attributes: ${e.attributes.join(", ")}`);
    if (e.methods.length) lines.push(`    methods: ${e.methods.join(", ")}`);
  }

  lines.push("", "Relationships:");
  if (document.relations.length === 0) lines.push("  (none recorded)");
  for (const r of document.relations) {
    const from = document.entity(r.fromId)?.name ?? r.fromId;
    const to = document.entity(r.toId)?.name ?? r.toId;
    lines.push(`  ${from} --${r.kind}--> ${to}${r.label ? ` (${r.label})` : ""}`);
  }

  lines.push("", "Decisions:");
  if (document.decisions.length === 0) lines.push("  (none recorded)");
  document.decisions.forEach((d, i) => {
    lines.push(`  ${i}. ${d.title}`);
    lines.push(`     rationale: ${d.rationale}`);
    lines.push(`     rejected: ${d.alternativeRejected || "(none named)"}`);
  });

  return lines.join("\n");
}
