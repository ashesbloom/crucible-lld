/**
 * The composition root.
 *
 * The one place that knows which concrete classes exist. Everything else takes
 * interfaces, which is why the domain has no idea whether it is talking to
 * SQLite or Turso, or whether a real model is available.
 *
 * Adding an evaluator is a line in the array below. That is the whole answer to
 * the brief's "can you add a rule-based evaluator or human review later" - the
 * practice flow, the rubric, the persistence layer and the UI never name one.
 */

import { EvaluationPipeline } from "@/domain/evaluation/EvaluationPipeline";
import { BlastRadiusEvaluator } from "@/domain/evaluators/BlastRadiusEvaluator";
import { HeuristicRubricEvaluator } from "@/domain/evaluators/HeuristicRubricEvaluator";
import { LlmRubricEvaluator } from "@/domain/evaluators/LlmRubricEvaluator";
import { StructureEvaluator } from "@/domain/evaluators/StructureEvaluator";
import { RandomIdGenerator, SystemClock, type Clock, type IdGenerator, type LlmClient } from "@/domain/ports/index";
import { rubricRegistry } from "@/domain/rubric/RubricRegistry";
import { LibsqlAttemptRepository } from "@/infrastructure/db/LibsqlAttemptRepository";
import { LibsqlEvaluationRepository } from "@/infrastructure/db/LibsqlEvaluationRepository";
import { createLlmClient } from "@/infrastructure/llm/AnthropicLlmClient";
import { SeededProblemRepository } from "@/infrastructure/problems/SeededProblemRepository";

export interface Container {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly llm: LlmClient;
  readonly problems: SeededProblemRepository;
  readonly attempts: LibsqlAttemptRepository;
  readonly evaluations: LibsqlEvaluationRepository;
  readonly rubrics: typeof rubricRegistry;
  readonly pipeline: EvaluationPipeline;
}

function build(): Container {
  const clock = new SystemClock();
  const llm = createLlmClient();

  return {
    clock,
    ids: new RandomIdGenerator(),
    llm,
    problems: new SeededProblemRepository(),
    attempts: new LibsqlAttemptRepository(),
    evaluations: new LibsqlEvaluationRepository(),
    rubrics: rubricRegistry,
    pipeline: new EvaluationPipeline(
      [
        // Order is display order in the UI. Deterministic checks first because
        // they land in under a millisecond and give the learner something to
        // read while the slow one is still running.
        new StructureEvaluator(),
        new HeuristicRubricEvaluator(llm),
        new LlmRubricEvaluator(llm),
        new BlastRadiusEvaluator(llm),
      ],
      clock,
    ),
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __crucibleContainer: Container | undefined;
}

export function container(): Container {
  globalThis.__crucibleContainer ??= build();
  return globalThis.__crucibleContainer;
}
