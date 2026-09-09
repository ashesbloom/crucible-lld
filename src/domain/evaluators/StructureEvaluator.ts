/**
 * The deterministic pass. No network, no model, no cost, runs in under a
 * millisecond, and it is authoritative for Requirement Coverage because
 * "does any class or decision address this requirement" is a question you can
 * answer by looking rather than by asking.
 *
 * Everything else it emits is a supporting note. Whether a class with nine
 * methods is a god class or a legitimately rich aggregate is a judgement call,
 * so this evaluator raises the observation and lets the LLM own the verdict.
 */

import type { DesignDocument } from "../design/DesignDocument";
import { uncoveredRequirements } from "../design/RequirementCoverage";
import type { EvaluationContext, Evaluator, EvaluatorOutput } from "../evaluation/Evaluator";
import type { Finding } from "../evaluation/Finding";
import type { LevelId } from "../rubric/Rubric";

const GOD_CLASS_METHOD_THRESHOLD = 8;

export class StructureEvaluator implements Evaluator {
  readonly id = "structure";
  readonly label = "Structural checks";
  readonly criteria = ["requirement-coverage", "responsibility-clarity", "coupling-cohesion", "abstraction"];

  supports(): boolean {
    return true;
  }

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutput> {
    const { document, problem } = context;
    const findings: Finding[] = [];

    findings.push(this.requirementCoverage(document, problem.requirements));

    const missingResponsibility = document.entitiesWithoutResponsibility();
    if (missingResponsibility.length > 0) {
      findings.push({
        criterionId: "responsibility-clarity",
        level: "L1",
        source: "DETERMINISTIC",
        evaluatorId: this.id,
        headline: `${missingResponsibility.length} class${missingResponsibility.length === 1 ? "" : "es"} state no responsibility`,
        evidence: missingResponsibility.map((e) => ({ kind: "ENTITY" as const, id: e.id })),
        concern: "A class whose job cannot be written in one sentence usually has more than one job.",
        suggestion: "Write a single sentence for each of these describing the one reason it would change.",
        confidence: "HIGH",
      });
    }

    const godClasses = document.godClasses(GOD_CLASS_METHOD_THRESHOLD);
    if (godClasses.length > 0) {
      findings.push({
        criterionId: "responsibility-clarity",
        level: "L1",
        source: "DETERMINISTIC",
        evaluatorId: this.id,
        headline: `${godClasses.map((e) => e.name).join(", ")} carr${godClasses.length === 1 ? "ies" : "y"} more than ${GOD_CLASS_METHOD_THRESHOLD} methods`,
        evidence: godClasses.map((e) => ({ kind: "ENTITY" as const, id: e.id })),
        concern: "Method count is a weak signal on its own, but it is where responsibilities usually pile up.",
        suggestion: "For each, check whether the methods split into two groups that change for different reasons.",
        confidence: "MEDIUM",
      });
    }

    const orphans = document.orphanEntities();
    if (orphans.length > 0 && document.entityCount > 1) {
      findings.push({
        criterionId: "coupling-cohesion",
        level: "L1",
        source: "DETERMINISTIC",
        evaluatorId: this.id,
        headline: `${orphans.map((e) => e.name).join(", ")} connect${orphans.length === 1 ? "s" : ""} to nothing`,
        evidence: orphans.map((e) => ({ kind: "ENTITY" as const, id: e.id })),
        concern: "A class with no recorded relationship is either unused or its collaborations were left implicit.",
        suggestion: "Record how each of these is reached, or drop it from the design.",
        confidence: "HIGH",
      });
    }

    const dangling = document.danglingRelations();
    if (dangling.length > 0) {
      findings.push({
        criterionId: "coupling-cohesion",
        level: "L0",
        source: "DETERMINISTIC",
        evaluatorId: this.id,
        headline: `${dangling.length} relationship${dangling.length === 1 ? "" : "s"} point at a class that does not exist`,
        evidence: [],
        concern: "This is a mistake rather than a style choice, and it means the diagram is not describing the design.",
        suggestion: "Remove the broken relationships or add the classes they refer to.",
        confidence: "HIGH",
      });
    }

    if (document.abstractionCount() === 0 && document.entityCount >= 4) {
      findings.push({
        criterionId: "abstraction",
        level: "L0",
        source: "DETERMINISTIC",
        evaluatorId: this.id,
        headline: "No interfaces or strategies anywhere in the design",
        evidence: [],
        concern: "Every collaboration is between concrete classes, so any variation has to be added by editing existing ones.",
        suggestion: "Find the one behaviour most likely to vary and put an interface in front of it.",
        confidence: "HIGH",
      });
    }

    return { findings, note: `${document.entityCount} classes, ${document.relations.length} relationships` };
  }

  private requirementCoverage(document: DesignDocument, requirements: readonly string[]): Finding {
    // Shared with the canvas checklist, so what the learner sees while typing
    // and what the evaluator scores at submit cannot disagree.
    const uncovered = uncoveredRequirements(document, requirements);
    const total = requirements.length;
    const ratio = total === 0 ? 1 : (total - uncovered.length) / total;
    const hasAssumptions = document.assumptions.length > 0;

    let level: LevelId;
    if (ratio < 0.34) level = "L0";
    else if (ratio < 1) level = "L1";
    else level = hasAssumptions ? "L3" : "L2";

    return {
      criterionId: "requirement-coverage",
      level,
      source: "DETERMINISTIC",
      evaluatorId: this.id,
      headline:
        uncovered.length === 0
          ? `All ${total} requirements are addressed somewhere in the design`
          : `${uncovered.length} of ${total} requirements have no home in the design`,
      evidence: uncovered.map((index) => ({ kind: "REQUIREMENT" as const, index })),
      concern:
        uncovered.length === 0
          ? hasAssumptions
            ? ""
            : "No assumptions were recorded, so any ambiguity in the brief was resolved silently."
          : "A requirement that no class or decision mentions is one you will discover late.",
      suggestion:
        uncovered.length === 0
          ? hasAssumptions
            ? ""
            : "Note the ambiguities you resolved. Interviewers weight this heavily."
          : "Name the class that owns each of the highlighted requirements, or record why it is out of scope.",
      confidence: uncovered.length === 0 ? "HIGH" : "MEDIUM",
    };
  }
}
