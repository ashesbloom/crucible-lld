/**
 * Which requirements the design does not appear to address.
 *
 * Extracted so the canvas checklist and the structural evaluator cannot drift.
 * A checklist that ticks a requirement the evaluator then marks uncovered would
 * be worse than no checklist at all.
 *
 * Deliberately generous: it is looking for a requirement with no home anywhere
 * in the design, not policing whether the learner used our vocabulary.
 */

import type { DesignDocument } from "./DesignDocument";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "with", "should", "must", "can",
  "will", "that", "this", "each", "when", "have", "has", "are", "is", "be",
  "from", "into", "than", "then", "them", "they", "its", "it", "of", "to", "in",
  "on", "at", "by", "as", "any", "all", "may", "not", "one", "more", "system",
  "support", "allow", "user", "users", "able",
]);

export function keywordsOf(requirement: string): readonly string[] {
  return requirement
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

/** Indices of the requirements nothing in the design mentions. */
export function uncoveredRequirements(
  document: DesignDocument,
  requirements: readonly string[],
): readonly number[] {
  const haystack = document.searchableText();
  const uncovered: number[] = [];

  requirements.forEach((requirement, index) => {
    const keywords = keywordsOf(requirement);
    const covered = keywords.length === 0 || keywords.some((k) => haystack.includes(k));
    if (!covered) uncovered.push(index);
  });

  return uncovered;
}
