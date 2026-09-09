import { Rubric, type RubricRegistry } from "./Rubric";
import { LLD_V1 } from "./rubrics/lldV1";

/**
 * One rubric today. This exists rather than a bare import so that a problem can
 * name its rubric by id, which is what lets a second rubric (say, a
 * concurrency-focused one) be added without touching any problem definition.
 */
export class InMemoryRubricRegistry implements RubricRegistry {
  private readonly rubrics = new Map<string, Rubric>([[LLD_V1.id, LLD_V1]]);

  get(id: string): Rubric {
    const rubric = this.rubrics.get(id);
    if (!rubric) throw new Error(`Unknown rubric: ${id}`);
    return rubric;
  }
}

export const rubricRegistry = new InMemoryRubricRegistry();
