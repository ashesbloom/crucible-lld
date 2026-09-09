import { notFound } from "next/navigation";
import { PracticeService } from "@/application/PracticeService";
import { AttemptHeader } from "@/components/AttemptHeader";
import { EvaluationReport } from "@/components/EvaluationReport";
import { LLD_V1 } from "@/domain/rubric/rubrics/lldV1";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ evaluation?: string }>;
}) {
  const { id } = await params;
  const { evaluation: fromQuery } = await searchParams;

  const service = new PracticeService();
  const attempt = await service.requireAttempt(id);

  const initial = attempt.submissionOfKind("INITIAL");
  if (!initial) notFound();

  const loaded = fromQuery
    ? await service.evaluation(fromQuery).catch(() => null)
    : await service.evaluationForSubmission(initial.id);
  if (!loaded) notFound();

  const problems = await service.listProblems();
  const problem = problems.find((p) => p.id === attempt.problemId)!;

  const changeTestDone = attempt.status === "COMPLETE";

  return (
    <div className="shell" style={{ padding: "2rem 0 4rem" }}>
      <AttemptHeader title={problem.title} attemptNumber={attempt.attemptNumber} step="review" />

      <EvaluationReport
        attemptId={attempt.id}
        evaluationId={loaded.id}
        initial={PracticeService.toView(loaded)}
        document={initial.document.toJSON()}
        rubric={{ id: LLD_V1.id, version: LLD_V1.version, criteria: [...LLD_V1.criteria] }}
        requirements={problem.requirements}
        changeTestDone={changeTestDone}
      />
    </div>
  );
}
