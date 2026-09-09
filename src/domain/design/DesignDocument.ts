/**
 * The canonical representation of a learner's design.
 *
 * Everything downstream reads this shape: the deterministic checks, the LLM
 * evaluator, the diagram renderer, and the change-test scoring. That is
 * deliberate. Today the learner fills a structured form; if we later accept an
 * uploaded class diagram or parsed source code, only a new
 * `DesignDocumentParser` has to exist. No evaluator, no rubric, and no view
 * changes, because they never knew where the document came from.
 */

/**
 * What kind of thing a class is. This is not decoration: the change-test seam
 * check reads stereotypes to decide whether a design had somewhere sensible to
 * put a new requirement, and naming the stereotype forces the learner to commit
 * to an intent rather than producing an undifferentiated bag of classes.
 */
export const STEREOTYPES = [
  "ENTITY",
  "VALUE_OBJECT",
  "SERVICE",
  "REPOSITORY",
  "STRATEGY",
  "FACTORY",
  "INTERFACE",
  "ENUM",
  "CONTROLLER",
] as const;

export type Stereotype = (typeof STEREOTYPES)[number];

export const RELATION_KINDS = ["HAS_A", "IS_A", "USES", "IMPLEMENTS"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export interface Entity {
  readonly id: string;
  readonly name: string;
  readonly stereotype: Stereotype;
  /** One sentence. If a learner cannot write it, the class is doing too much. */
  readonly responsibility: string;
  readonly attributes: readonly string[];
  readonly methods: readonly string[];
}

export interface Relation {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: RelationKind;
  readonly label?: string;
}

/**
 * A recorded trade-off. `alternativeRejected` is the field that matters most:
 * a design decision without a discarded alternative is usually not a decision,
 * it is a default that was never examined.
 */
export interface Decision {
  readonly title: string;
  readonly rationale: string;
  readonly alternativeRejected: string;
}

export interface DesignDocumentInput {
  readonly assumptions?: readonly string[];
  readonly entities?: readonly Entity[];
  readonly relations?: readonly Relation[];
  readonly decisions?: readonly Decision[];
}

export class DesignDocument {
  readonly assumptions: readonly string[];
  readonly entities: readonly Entity[];
  readonly relations: readonly Relation[];
  readonly decisions: readonly Decision[];

  private readonly byId: ReadonlyMap<string, Entity>;

  private constructor(input: Required<DesignDocumentInput>) {
    this.assumptions = input.assumptions;
    this.entities = input.entities;
    this.relations = input.relations;
    this.decisions = input.decisions;
    this.byId = new Map(this.entities.map((e) => [e.id, e]));
  }

  /**
   * The only way to build one. Untrusted input crosses this boundary straight
   * from an HTTP body, so duplicate ids and malformed entities are rejected
   * here rather than surfacing later as a confusing evaluation result.
   */
  static create(input: DesignDocumentInput): DesignDocument {
    const entities = input.entities ?? [];
    const seen = new Set<string>();

    for (const entity of entities) {
      if (!entity.id || !entity.name) {
        throw new InvalidDesignError("Every entity needs an id and a name.");
      }
      if (seen.has(entity.id)) {
        throw new InvalidDesignError(`Duplicate entity id: ${entity.id}`);
      }
      seen.add(entity.id);
    }

    return new DesignDocument({
      assumptions: input.assumptions ?? [],
      entities,
      relations: input.relations ?? [],
      decisions: input.decisions ?? [],
    });
  }

  static empty(): DesignDocument {
    return DesignDocument.create({});
  }

  entity(id: string): Entity | undefined {
    return this.byId.get(id);
  }

  hasEntity(id: string): boolean {
    return this.byId.has(id);
  }

  get entityCount(): number {
    return this.entities.length;
  }

  isEmpty(): boolean {
    return this.entities.length === 0;
  }

  /** Entities that no relation touches in either direction. */
  orphanEntities(): readonly Entity[] {
    const connected = new Set<string>();
    for (const r of this.relations) {
      connected.add(r.fromId);
      connected.add(r.toId);
    }
    return this.entities.filter((e) => !connected.has(e.id));
  }

  /** Relations whose endpoints do not exist. Always a mistake, never a style choice. */
  danglingRelations(): readonly Relation[] {
    return this.relations.filter(
      (r) => !this.hasEntity(r.fromId) || !this.hasEntity(r.toId),
    );
  }

  entitiesWithoutResponsibility(): readonly Entity[] {
    return this.entities.filter((e) => e.responsibility.trim().length === 0);
  }

  /** Classes carrying more methods than one responsibility plausibly justifies. */
  godClasses(methodThreshold: number): readonly Entity[] {
    return this.entities.filter((e) => e.methods.length > methodThreshold);
  }

  abstractionCount(): number {
    return this.entities.filter(
      (e) => e.stereotype === "INTERFACE" || e.stereotype === "STRATEGY",
    ).length;
  }

  /** Relations per entity. Very low means a class list; very high means a ball of mud. */
  relationDensity(): number {
    if (this.entities.length === 0) return 0;
    return this.relations.length / this.entities.length;
  }

  averageMethodsPerEntity(): number {
    if (this.entities.length === 0) return 0;
    const total = this.entities.reduce((sum, e) => sum + e.methods.length, 0);
    return total / this.entities.length;
  }

  /** All searchable prose, lowercased. Used by the keyword-based seam check. */
  searchableText(): string {
    return [
      ...this.entities.map(
        (e) => `${e.name} ${e.responsibility} ${e.attributes.join(" ")} ${e.methods.join(" ")}`,
      ),
      ...this.decisions.map((d) => `${d.title} ${d.rationale}`),
      ...this.assumptions,
    ]
      .join(" ")
      .toLowerCase();
  }

  toJSON(): DesignDocumentInput {
    return {
      assumptions: this.assumptions,
      entities: this.entities,
      relations: this.relations,
      decisions: this.decisions,
    };
  }
}

export class InvalidDesignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDesignError";
  }
}

/**
 * The extensibility seam for submission formats.
 *
 * A future diagram upload or source-code submission implements this and
 * produces the same `DesignDocument`. Nothing downstream is aware.
 */
export interface DesignDocumentParser<TRaw = unknown> {
  readonly format: string;
  parse(raw: TRaw): DesignDocument;
}

/** The one implementation the MVP ships: the structured form posts this shape already. */
export class StructuredFormParser implements DesignDocumentParser<DesignDocumentInput> {
  readonly format = "structured-form";
  parse(raw: DesignDocumentInput): DesignDocument {
    return DesignDocument.create(raw);
  }
}
