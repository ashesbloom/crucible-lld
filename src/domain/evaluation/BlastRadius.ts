/**
 * The change test.
 *
 * The premise of this whole project is that "is this a good design?" has no
 * answer when several designs are valid, but "what does this design have to
 * touch when the requirements change?" does. Blast radius is that answer, and
 * it is arithmetic on the learner's own impact tagging rather than an opinion
 * anybody has to trust.
 *
 * Par is set per problem by the author, because how much *should* change
 * genuinely differs: adding a pricing rule and adding a scheduling mode do not
 * cost the same even in a well-factored design.
 */

import type { Entity, DesignDocument } from "../design/DesignDocument";
import type { ChangeTestSpec, Seam } from "../problem/Problem";
import type { LevelId } from "../rubric/Rubric";

export type ImpactVerdict = "UNCHANGED" | "MODIFIED" | "NEW";

export interface EntityImpact {
  readonly entityId: string;
  readonly verdict: ImpactVerdict;
  readonly rationale: string;
}

export interface ChangeTestResponse {
  readonly impacts: readonly EntityImpact[];
  /** Classes the learner would add to absorb the change. */
  readonly newEntities: readonly Entity[];
  readonly narrative: string;
}

export type RadiusBand = "CONTAINED" | "MODERATE" | "WIDE";

export interface SeamResult {
  readonly seam: Seam;
  readonly satisfied: boolean;
  readonly matchedEntityId?: string;
  readonly matchedEntityName?: string;
}

export interface BlastRadiusResult {
  readonly radius: number;
  readonly par: number;
  readonly band: RadiusBand;
  readonly level: LevelId;
  readonly originalCount: number;
  readonly modifiedCount: number;
  readonly newCount: number;
  readonly unchangedCount: number;
  readonly seams: readonly SeamResult[];
  readonly seamsSatisfied: number;
  /** True when the learner claimed nothing at all had to change. */
  readonly claimedNoChange: boolean;
}

/** Above this, the design did not absorb the change, it was rewritten around it. */
const REWRITE_THRESHOLD = 0.75;
/** How far past par still counts as absorbed rather than sprayed. */
const MODERATE_MULTIPLIER = 1.6;

/**
 * Did the original design have anywhere sensible to put this concern?
 *
 * Matching is against the class name and its method names, deliberately not its
 * prose responsibility. Searching the description made any class that mentioned
 * a domain noun look like a seam - a ParkingLot whose summary said "allocates
 * spots" counted as the seam for spot types, which it plainly is not. Name and
 * methods say what a class *is* and *does*; the description only says what its
 * author was thinking about.
 *
 * ponytail: keyword plus stereotype matching. Honest about what it is - a cheap
 * structural check, not comprehension - and why the model gets a second look at
 * the same claim. Upgrade path if it proves too blunt: ask the model to map each
 * seam to an entity id and intersect the two answers.
 */
export function checkSeams(document: DesignDocument, seams: readonly Seam[]): readonly SeamResult[] {
  return seams.map((seam): SeamResult => {
    for (const entity of document.entities) {
      if (!seam.satisfyingStereotypes.includes(entity.stereotype)) continue;

      const structural = `${entity.name} ${entity.methods.join(" ")}`.toLowerCase();
      if (seam.keywords.some((k) => structural.includes(k.toLowerCase()))) {
        return { seam, satisfied: true, matchedEntityId: entity.id, matchedEntityName: entity.name };
      }
    }
    return { seam, satisfied: false };
  });
}

export function computeBlastRadius(
  original: DesignDocument,
  response: ChangeTestResponse,
  spec: ChangeTestSpec,
): BlastRadiusResult {
  // Only count impacts that refer to classes the learner actually designed.
  const known = response.impacts.filter((i) => original.hasEntity(i.entityId));

  const modifiedCount = known.filter((i) => i.verdict === "MODIFIED").length;
  const unchangedCount = known.filter((i) => i.verdict === "UNCHANGED").length;
  const newCount = response.newEntities.length;

  const originalCount = original.entityCount;
  const total = originalCount + newCount;
  const touched = modifiedCount + newCount;
  const radius = total === 0 ? 1 : touched / total;

  const seams = checkSeams(original, spec.expectedSeams);
  const seamsSatisfied = seams.filter((s) => s.satisfied).length;

  // Nothing modified and nothing added means the change was not absorbed, it was
  // ignored. A radius of zero would otherwise read as a perfect score.
  const claimedNoChange = touched === 0;

  return {
    radius,
    par: spec.parBlastRadius,
    band: bandFor(radius, spec.parBlastRadius),
    level: levelFor(radius, spec.parBlastRadius, seams, claimedNoChange),
    originalCount,
    modifiedCount,
    newCount,
    unchangedCount,
    seams,
    seamsSatisfied,
    claimedNoChange,
  };
}

function bandFor(radius: number, par: number): RadiusBand {
  if (radius <= par) return "CONTAINED";
  if (radius <= par * MODERATE_MULTIPLIER) return "MODERATE";
  return "WIDE";
}

function levelFor(
  radius: number,
  par: number,
  seams: readonly SeamResult[],
  claimedNoChange: boolean,
): LevelId {
  if (claimedNoChange) return "L0";

  const satisfied = seams.filter((s) => s.satisfied).length;
  const allSeams = seams.length > 0 && satisfied === seams.length;
  const someSeams = seams.length === 0 || satisfied > 0;

  if (radius > REWRITE_THRESHOLD) return "L0";
  if (!someSeams) return "L0";
  if (radius <= par && allSeams) return "L3";
  if (radius <= par * MODERATE_MULTIPLIER) return "L2";
  return "L1";
}
