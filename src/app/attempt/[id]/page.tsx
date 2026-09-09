import { redirect } from "next/navigation";
import { PracticeService } from "@/application/PracticeService";
import { DesignCanvas } from "@/components/DesignCanvas";
import { AttemptHeader } from "@/components/AttemptHeader";

export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = new PracticeService();
  const attempt = await service.requireAttempt(id);

  // The aggregate already knows where in the loop this attempt is, so the
  // routing is a switch over one field rather than a guess from several.
  if (attempt.status === "SUBMITTED" || attempt.status === "COMPLETE") redirect(`/attempt/${id}/report`);
  if (attempt.status === "CHANGE_TEST") redirect(`/attempt/${id}/change-test`);

  const problems = await service.listProblems();
  const problem = problems.find((p) => p.id === attempt.problemId)!;

  return (
    <div className="shell" style={{ padding: "2rem 0 4rem" }}>
      <AttemptHeader
        title={problem.title}
        attemptNumber={attempt.attemptNumber}
        step="design"
      />

      <DesignCanvas
        attemptId={attempt.id}
        problemTitle={problem.title}
        statement={problem.statement}
        requirements={problem.requirements}
        constraints={problem.constraints}
        initial={attempt.draft.toJSON()}
      />
    </div>
  );
}
