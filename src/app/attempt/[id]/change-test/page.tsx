import { notFound, redirect } from "next/navigation";
import { PracticeService } from "@/application/PracticeService";
import { AttemptHeader } from "@/components/AttemptHeader";
import { ChangeTest } from "@/components/ChangeTest";

export const dynamic = "force-dynamic";

export default async function ChangeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = new PracticeService();
  const attempt = await service.requireAttempt(id);

  if (attempt.status === "DRAFTING") redirect(`/attempt/${id}`);

  const initial = attempt.submissionOfKind("INITIAL");
  if (!initial) notFound();

  const problems = await service.listProblems();
  const problem = problems.find((p) => p.id === attempt.problemId)!;

  // Present only once it has been answered. Until then the result is the point
  // of the exercise and showing it early would give the answer away.
  const answered = attempt.submissionOfKind("CHANGE_TEST");
  const evaluation = answered ? await service.evaluationForSubmission(answered.id) : null;

  return (
    <div className="shell" style={{ padding: "2rem 0 4rem" }}>
      <AttemptHeader title={problem.title} attemptNumber={attempt.attemptNumber} step="change" />

      <ChangeTest
        attemptId={attempt.id}
        document={initial.document.toJSON()}
        requirement={problem.changeTest.requirement}
        framing={problem.changeTest.framing}
        parBlastRadius={problem.changeTest.parBlastRadius}
        answeredEvaluationId={evaluation?.id ?? null}
        answeredEvaluation={evaluation ? PracticeService.toView(evaluation) : null}
        previousResponse={answered?.changeTestResponse ?? null}
      />
    </div>
  );
}
