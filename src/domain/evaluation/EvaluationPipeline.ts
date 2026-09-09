/**
 * Runs the evaluators and turns their findings into one report.
 *
 * Two things here are deliberate.
 *
 * `Promise.allSettled`, not `Promise.all`. The first version failed the whole
 * evaluation whenever the LLM call rejected, which threw away the deterministic
 * findings that had already succeeded and left the learner with nothing. A
 * partial report that says which part is missing is strictly better than an
 * error page.
 *
 * The summary, strengths and next actions are derived deterministically from
 * the findings rather than asked of a model. They are a view over data we
 * already have, and asking an LLM to restate its own output is a way to
 * introduce a disagreement between the score and the prose describing it.
 */

import type { Clock } from "../ports/index";
import { LEVEL_VALUE, type Rubric } from "../rubric/Rubric";
import type { BlastRadiusResult } from "./BlastRadius";
import { EvidenceResolver } from "./EvidenceResolver";
import type { EvaluationContext, Evaluator } from "./Evaluator";
import type { EvaluatorRun, FeedbackReport } from "./FeedbackReport";
import type { Finding } from "./Finding";

export class EvaluationPipeline {
  constructor(
    private readonly evaluators: readonly Evaluator[],
    private readonly clock: Clock,
  ) {}

  /** Which evaluators will actually run, so the UI can render the stages up front. */
  plan(context: EvaluationContext): readonly Evaluator[] {
    return this.evaluators.filter((e) => e.supports(context));
  }

  async run(
    context: EvaluationContext,
    onStage?: (run: EvaluatorRun) => void,
  ): Promise<FeedbackReport> {
    const active = this.plan(context);

    const settled = await Promise.allSettled(
      active.map(async (evaluator) => {
        const startedAt = this.clock.now().getTime();
        try {
          const output = await evaluator.evaluate(context);
          return { evaluator, output, durationMs: this.clock.now().getTime() - startedAt };
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          throw new EvaluatorFailure(evaluator, message, this.clock.now().getTime() - startedAt);
        }
      }),
    );

    const findings: Finding[] = [];
    const runs: EvaluatorRun[] = [];
    let blastRadius: BlastRadiusResult | null = null;

    for (const result of settled) {
      if (result.status === "fulfilled") {
        const { evaluator, output, durationMs } = result.value;
        findings.push(...output.findings);
        if (output.blastRadius) blastRadius = output.blastRadius;
        const run: EvaluatorRun = {
          evaluatorId: evaluator.id, label: evaluator.label, ok: true,
          note: output.note, durationMs,
        };
        runs.push(run);
        onStage?.(run);
      } else {
        const failure = result.reason as EvaluatorFailure;
        const run: EvaluatorRun = {
          evaluatorId: failure.evaluator.id, label: failure.evaluator.label, ok: false,
          note: failure.message, durationMs: failure.durationMs,
        };
        runs.push(run);
        onStage?.(run);
      }
    }

    const resolver = new EvidenceResolver(context.document, context.problem.requirements.length);
    const { kept, discarded } = resolver.resolve(findings);

    const score = context.rubric.score(kept);
    const degraded = runs.some((r) => !r.ok);

    return {
      rubricId: context.rubric.id,
      rubricVersion: context.rubric.version,
      score,
      findings: kept,
      blastRadius,
      summary: summarise(context.rubric, score.overall, score.band, blastRadius, degraded),
      strengths: strengthsFrom(kept),
      nextActions: nextActionsFrom(kept, context.rubric),
      runs,
      discardedFindings: discarded.length,
      degraded,
    };
  }
}

class EvaluatorFailure extends Error {
  constructor(
    readonly evaluator: Evaluator,
    message: string,
    readonly durationMs: number,
  ) {
    super(message);
    this.name = "EvaluatorFailure";
  }
}

function summarise(
  rubric: Rubric,
  overall: number,
  band: string,
  blastRadius: BlastRadiusResult | null,
  degraded: boolean,
): string {
  const parts = [`${band} overall, scoring ${overall} out of 100 against ${rubric.id}.`];

  if (blastRadius) {
    const pct = Math.round(blastRadius.radius * 100);
    const parPct = Math.round(blastRadius.par * 100);
    parts.push(
      blastRadius.claimedNoChange
        ? "The change test was answered as though nothing needed to change, which is not a design that absorbed the requirement."
        : `The change touched ${pct}% of the design against a par of ${parPct}%, which is ${blastRadius.band.toLowerCase()}.`,
    );
  }

  if (degraded) {
    parts.push("One evaluator did not finish, so part of this report is missing rather than negative.");
  }

  return parts.join(" ");
}

function strengthsFrom(findings: readonly Finding[]): readonly string[] {
  return findings
    .filter((f) => LEVEL_VALUE[f.level] >= 2)
    .slice(0, 4)
    .map((f) => f.headline);
}

/**
 * The three things most worth fixing: weakest level first, and within a level
 * the criterion that carries the most weight. Capped at three because a list of
 * twelve improvements is a list nobody acts on.
 */
function nextActionsFrom(findings: readonly Finding[], rubric: Rubric): readonly string[] {
  return findings
    .filter((f) => LEVEL_VALUE[f.level] < 2 && f.suggestion.trim().length > 0)
    .sort((a, b) => {
      const byLevel = LEVEL_VALUE[a.level] - LEVEL_VALUE[b.level];
      if (byLevel !== 0) return byLevel;
      return (rubric.criterion(b.criterionId)?.weight ?? 0) - (rubric.criterion(a.criterionId)?.weight ?? 0);
    })
    .slice(0, 3)
    .map((f) => f.suggestion);
}
