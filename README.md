# Crucible

**Low-level design practice that stresses your design instead of grading it.**

Every LLD tool grades the design you wrote. That question has no answer, because several different designs are correct — a point the field openly admits. Crucible asks the one question that does have an answer: *when the requirements change, what does this design have to touch?*

You design a system, get a rubric review where every criticism cites a class you actually wrote, and then a requirement you have never seen arrives. You mark which of your own classes it forces open, and the platform measures the blast radius against a par set by the problem author.

Built for the CipherSchools two-day LLD assignment.

---

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and click **Take the tour**. That seeds three completed attempts and walks the whole loop in five screens.

**No API key is needed.** Without one, the judged criteria fall back to a heuristic evaluator that derives levels from measurable properties of your submission, so the loop works end to end and a bad design still scores badly. To use Claude for the judged criteria:

```bash
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
```

```bash
npm test        # 104 tests, no network, no API key needed
npm run build   # production build
npm run typecheck
```

Requires Node 20 or newer. The database is a local SQLite file (`crucible.db`), created on first run. Deleting it resets everything.

## What to look at first

| If you have | Look at |
| --- | --- |
| 3 minutes | [`/tour`](http://localhost:3000/tour) — the loop, end to end |
| 10 minutes | The tour, then [`DESIGN.md`](DESIGN.md) |
| Only the code | `src/domain/` — nothing in it imports React, Next.js, or SQL |

The three written deliverables are markdown at the repo root and are also rendered inside the app, from those exact files rather than a copy: [Research](RESEARCH.md) · [Design](DESIGN.md) · [AI usage](AI_USAGE.md).

## How it is put together

```
src/domain/          Framework-free. Zero imports from React, Next.js or SQLite.
  design/            DesignDocument — the canonical submission, and its Mermaid renderer
  problem/           Problem, and the hidden ChangeTestSpec with its seams and par
  attempt/           Attempt aggregate: DRAFTING -> SUBMITTED -> CHANGE_TEST -> COMPLETE
  evaluation/        Evaluation state machine, Evaluator interface, pipeline, blast radius
  rubric/            Six criteria, four behaviour-anchored levels each, pure scoring
  evaluators/        Four implementations of one interface
src/application/     Use cases, the worker, and the one composition root
src/infrastructure/  SQLite repositories, the Anthropic adapter, seeded problems
src/app/             Next.js routes and the UI
```

### The decisions worth knowing about

**The submission is a structured design document, not code or prose.** Structure is what makes deterministic checks possible at all, and it keeps the model's input identical between runs, which is the single biggest lever on consistent output. A class diagram is that same data with a different renderer — which is why the diagram on the canvas is generated from the exact object the evaluators read.

**Two of the six criteria are counted, four are judged, and the split is enforced.** `Rubric.score` will not let a model's verdict decide a criterion it does not own, so an LLM cannot talk its way into a better requirement-coverage score. Every criterion in the UI says which evaluator produced it.

**Extensibility is the deterministic one.** Blast radius is arithmetic on the learner's own impact tagging, compared against the problem's par. The model's only job in that round is auditing one specific claim: classes marked as needing no change that plainly do.

**Feedback that cites nothing real is discarded.** Every finding carries evidence references, and `EvidenceResolver` drops any whose evidence does not resolve to a class in the submission. The count of discarded findings is shown in the report rather than hidden. This exists because the model criticised a `PaymentProcessor` that did not exist.

**Adding an evaluator is one line.** `Evaluator` is an interface with four implementations, and the pipeline is handed a list in `src/application/container.ts`. A rule-based checker, human review, or a test runner is a new class and one array entry; the practice flow, rubric, persistence, and UI never name a concrete evaluator.

### Reliability

Submit stores the work and returns `202` immediately; it never waits on a model. An in-process worker moves evaluations through `QUEUED → RUNNING → COMPLETED | FAILED` with a cap of three attempts. Idempotency is a `UNIQUE (attempt_id, idempotency_key)` constraint, scoped to the attempt so a reused key cannot leak one attempt's report into another. Evaluators run under `Promise.allSettled`, so one failing evaluator produces a degraded report rather than an error page, with the missing criteria marked *not assessed* instead of scored zero.

If this grew, the first thing to split out is the evaluation worker — it is the only slow, bursty, failure-prone part, and `EvaluationRepository` already isolates it.

## Tests

104 tests, all offline. The interesting ones assert that something is refused:

```
Evaluation           illegal transitions throw; retries stop at the cap
Attempt              cannot submit twice, cannot edit after submitting,
                     cannot open the change test early
EvidenceResolver     drops findings citing classes that do not exist
LlmRubricEvaluator   drops unknown criteria and off-scale levels; retries once, then stops
EvaluationPipeline   degrades to a partial report when an evaluator throws
BlastRadius          claiming nothing changed scores L0, not a perfect zero
CombinedScore        neither round alone covers the whole rubric
PracticeLoop         the full loop against a real in-memory database,
                     including idempotency scoped to its attempt
MermaidEmitter       the real Mermaid parser accepts what the emitter writes,
                     impact colouring included
```

## Limitations

Honest list, in the order I would fix them.

1. **The rubric is argued for, not calibrated.** The level descriptors are written so two readers would agree, but I have not scored twenty known-good and known-bad designs to check the levels land where a human would put them.
2. **Blast radius depends on honest self-reporting.** The model audits under-reporting and the deterministic guard catches "nothing changed", but a learner determined to game it can.
3. **Seam matching is keyword-and-stereotype.** Marked as such in the code, with the upgrade path named: ask the model to map seams to class ids and intersect with the structural match.
4. **One in-process worker.** `claimNextQueued` is a plain read, which is correct for exactly one worker and would need a real claim for two.
5. **No accounts.** A single seeded learner. Every repository is already keyed by learner id, so this is a lookup rather than a rewrite.
6. **The report does not know about your history.** The history page finds a recurring weakness; the report cannot yet say "this is the third attempt where no decision named a rejected alternative", which would be worth more than any single score.

## Deploying

The repositories talk to libSQL, which serves a local file and hosted SQLite through one client. Point `DATABASE_URL` at a `libsql://` URL and set `DATABASE_AUTH_TOKEN`, and the same code runs on a platform with a read-only filesystem. Set `ANTHROPIC_API_KEY` to enable the judged criteria.
