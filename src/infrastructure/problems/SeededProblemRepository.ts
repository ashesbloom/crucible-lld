import type { Problem, ProblemRepository } from "@/domain/problem/Problem";
import { PROBLEMS, PROBLEMS_BY_ID, PROBLEMS_BY_SLUG } from "./seed";

/** Reads the authored problem set. Async only because the interface is. */
export class SeededProblemRepository implements ProblemRepository {
  async findById(id: string): Promise<Problem | null> {
    return PROBLEMS_BY_ID.get(id) ?? null;
  }
  async findBySlug(slug: string): Promise<Problem | null> {
    return PROBLEMS_BY_SLUG.get(slug) ?? null;
  }
  async list(): Promise<readonly Problem[]> {
    return PROBLEMS;
  }
}
