/**
 * A practice problem. Seeded, immutable, authored by us rather than by users,
 * so there is no problem-authoring UI and no need for one in an MVP.
 */

/**
 * A place a design should have left room for change.
 *
 * Deliberately not a class name. Naming the expected class would smuggle a
 * reference solution in through the back door, and the whole premise here is
 * that many different class layouts are valid. A seam names the *concern* that
 * needs somewhere to live; the check is whether the learner's design has any
 * plausible home for it.
 */
export interface Seam {
  readonly id: string;
  readonly label: string;
  /** Any of these words appearing near a matching stereotype counts as a hit. */
  readonly keywords: readonly string[];
  /** Stereotypes that would constitute a real seam rather than an inline branch. */
  readonly satisfyingStereotypes: readonly string[];
  /** Shown to the learner after scoring, never before. */
  readonly explanation: string;
}

/**
 * The hidden second-round requirement.
 *
 * `parBlastRadius` is the fraction of classes a design with the right seams
 * would need to touch. It is a judgement call by the problem author, not a
 * measured constant, and it is stated per problem because "how much should
 * change" genuinely differs between a pricing change and a scheduling change.
 */
export interface ChangeTestSpec {
  readonly requirement: string;
  readonly framing: string;
  readonly expectedSeams: readonly Seam[];
  readonly parBlastRadius: number;
}

export type Difficulty = "STARTER" | "CORE" | "STRETCH";

export interface ProblemInput {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly difficulty: Difficulty;
  readonly summary: string;
  readonly statement: string;
  readonly requirements: readonly string[];
  readonly constraints: readonly string[];
  readonly conceptsProbed: readonly string[];
  readonly rubricId: string;
  readonly changeTest: ChangeTestSpec;
  readonly estimatedMinutes: number;
}

export class Problem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly difficulty: Difficulty;
  readonly summary: string;
  readonly statement: string;
  readonly requirements: readonly string[];
  readonly constraints: readonly string[];
  readonly conceptsProbed: readonly string[];
  readonly rubricId: string;
  readonly changeTest: ChangeTestSpec;
  readonly estimatedMinutes: number;

  constructor(input: ProblemInput) {
    if (input.changeTest.parBlastRadius <= 0 || input.changeTest.parBlastRadius > 1) {
      throw new Error(`parBlastRadius must be a fraction in (0,1] for problem ${input.id}`);
    }
    this.id = input.id;
    this.slug = input.slug;
    this.title = input.title;
    this.difficulty = input.difficulty;
    this.summary = input.summary;
    this.statement = input.statement;
    this.requirements = input.requirements;
    this.constraints = input.constraints;
    this.conceptsProbed = input.conceptsProbed;
    this.rubricId = input.rubricId;
    this.changeTest = input.changeTest;
    this.estimatedMinutes = input.estimatedMinutes;
  }
}

export interface ProblemRepository {
  findById(id: string): Promise<Problem | null>;
  findBySlug(slug: string): Promise<Problem | null>;
  list(): Promise<readonly Problem[]>;
}
