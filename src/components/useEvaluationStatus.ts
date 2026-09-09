"use client";

import { useEffect, useState } from "react";
import type { EvaluationStatus, StageRecord } from "@/domain/evaluation/Evaluation";
import type { FeedbackReport } from "@/domain/evaluation/FeedbackReport";

export interface EvaluationView {
  id: string;
  status: EvaluationStatus;
  attempts: number;
  stages: StageRecord[];
  error: string | null;
  canRetry: boolean;
  report: FeedbackReport | null;
}

/**
 * Polls one evaluation until it reaches a terminal state.
 *
 * Three details, all of them learned the hard way.
 *
 * The effect is keyed on the evaluation *id*, not on the fetched object. The
 * first version had the response in the dependency array, so every poll set
 * state, which re-ran the effect, which started another timer. Four pollers
 * were in flight inside ten seconds.
 *
 * The timer is chained after each response rather than set on an interval, so a
 * slow response cannot overlap with the next request.
 *
 * The cleanup both cancels the timer and flags in-flight responses as stale, so
 * navigating away mid-poll does not set state on a component that is gone.
 */
export function useEvaluationStatus(
  evaluationId: string | null,
  options: { initial?: EvaluationView | null; intervalMs?: number } = {},
): EvaluationView | null {
  const { initial = null, intervalMs = 900 } = options;
  const [view, setView] = useState<EvaluationView | null>(initial);

  useEffect(() => {
    if (!evaluationId) return;

    // Most reports are read long after they finished - anything reached from
    // history is already terminal. Polling for a result the server already
    // rendered costs a round trip and shows a loading state for content that is
    // sitting right there.
    if (initial && (initial.status === "COMPLETED" || initial.status === "FAILED")) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const response = await fetch(`/api/evaluations/${evaluationId}`, { cache: "no-store" });
        if (cancelled) return;

        const data = (await response.json()) as EvaluationView;
        if (cancelled) return;

        setView(data);

        if (data.status !== "COMPLETED" && data.status !== "FAILED") {
          timer = setTimeout(poll, intervalMs);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, intervalMs * 2);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Keyed on the id and the terminal-ness of the seed, never on the polled
    // response. Depending on the response is what started four pollers.
  }, [evaluationId, intervalMs, initial]);

  return view;
}
