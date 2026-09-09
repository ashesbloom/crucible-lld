/**
 * The one rubric the MVP ships. Versioned, because changing a descriptor
 * changes what past scores meant, and an attempt history is only useful if you
 * can tell which rubric produced each score.
 *
 * Descriptors are written so two readers would agree. That is the whole test.
 * Anywhere a descriptor slipped into "mostly clear" or "good separation" it was
 * rewritten until it named something countable or checkable.
 */

import { Rubric, type Criterion } from "../Rubric";

const criteria: readonly Criterion[] = [
  {
    id: "requirement-coverage",
    name: "Requirement Coverage",
    question: "Does the design actually answer the brief that was given?",
    weight: 15,
    authoritativeSource: "DETERMINISTIC",
    why: "Whether a requirement has a home in the design is countable, so no model needs to be asked.",
    levels: [
      { level: "L0", descriptor: "Fewer than a third of the stated requirements are traceable to any class or recorded decision." },
      { level: "L1", descriptor: "About half the requirements are traceable; at least one core requirement has no home in the design." },
      { level: "L2", descriptor: "Every stated requirement is traceable to at least one class or recorded decision." },
      { level: "L3", descriptor: "Every requirement is traceable, and the assumptions name at least one ambiguity the brief left open." },
    ],
  },
  {
    id: "responsibility-clarity",
    name: "Responsibility Clarity",
    question: "Does each class own exactly one job?",
    weight: 20,
    authoritativeSource: "LLM",
    why: "Judging whether two stated responsibilities are really one job needs reading comprehension, not counting.",
    levels: [
      { level: "L0", descriptor: "Most classes state no responsibility, or a single class holds the bulk of the behaviour." },
      { level: "L1", descriptor: "Responsibilities are stated, but several classes describe more than one reason to change." },
      { level: "L2", descriptor: "Every class states a responsibility and no class owns more than one reason to change." },
      { level: "L3", descriptor: "As L2, and behaviour sits with the data it operates on rather than in a separate manager class." },
    ],
  },
  {
    id: "abstraction",
    name: "Abstraction & Interfaces",
    question: "Do the abstractions earn their place?",
    weight: 20,
    authoritativeSource: "LLM",
    why: "Counting interfaces is easy and meaningless; judging whether one has a second plausible implementation is not.",
    levels: [
      { level: "L0", descriptor: "No interfaces or abstract types; every collaboration is between concrete classes." },
      { level: "L1", descriptor: "Interfaces exist but each is a one-to-one wrapper over a single concrete class." },
      { level: "L2", descriptor: "At least one interface has more than one plausible implementation, and callers depend on it rather than on a concrete type." },
      { level: "L3", descriptor: "As L2, and each abstraction is justified in the decisions by a named variation it absorbs." },
    ],
  },
  {
    id: "coupling-cohesion",
    name: "Coupling & Cohesion",
    question: "Are the relationships between classes deliberate?",
    weight: 15,
    authoritativeSource: "LLM",
    why: "Relation counts are a weak signal; whether a dependency points the right way is a judgement.",
    levels: [
      { level: "L0", descriptor: "No relationships are recorded, or nearly every class is connected to nearly every other." },
      { level: "L1", descriptor: "Relationships are recorded but their direction or kind is frequently arbitrary." },
      { level: "L2", descriptor: "Relationships are typed and directed, and no class reaches through another to get at a third." },
      { level: "L3", descriptor: "As L2, and dependencies point from the classes most likely to change toward the ones least likely to." },
    ],
  },
  {
    id: "extensibility",
    name: "Extensibility",
    question: "What breaks when the requirements change?",
    weight: 20,
    authoritativeSource: "DETERMINISTIC",
    why: "This is the one criterion with an objective answer: run the change and count what the design had to touch.",
    levels: [
      { level: "L0", descriptor: "The change has no seam to land in, or absorbing it touches more than three quarters of the classes." },
      { level: "L1", descriptor: "The change is absorbed but touches well beyond par, so the concern was inlined rather than separated." },
      { level: "L2", descriptor: "The change is absorbed close to par: existing abstractions took it with limited edits." },
      { level: "L3", descriptor: "The change is absorbed at or under par and every seam it needed was already present in the original design." },
    ],
  },
  {
    id: "reasoning",
    name: "Reasoning Quality",
    question: "Can the learner defend the design they chose?",
    weight: 10,
    authoritativeSource: "LLM",
    why: "Distinguishing a real trade-off from a restated fact requires reading the argument.",
    levels: [
      { level: "L0", descriptor: "No decisions are recorded, or the decisions restate what the class list already shows." },
      { level: "L1", descriptor: "Decisions are recorded but the rationale is generic and no alternative is named." },
      { level: "L2", descriptor: "Every decision names a rejected alternative and why the trade-off went the way it did." },
      { level: "L3", descriptor: "As L2, and at least one decision names the condition under which it should be revisited." },
    ],
  },
];

export const LLD_V1 = new Rubric("lld-v1", 1, criteria);
