# AI usage

I used Claude throughout: for the market scan, as a pair while designing the domain, and to write a lot of the code. The parts worth writing down are not where it helped, which was most places, but the handful where its first answer was wrong in a way that would have shipped quietly.

Every entry below points at code in this repository, and every fix has a test.

---

## 1. Parsing the model's answer instead of constraining it

**Suggested.** The first version of the evaluator did the obvious thing:

```ts
const parsed = JSON.parse(response.content[0].text);
```

It worked. It kept working for two runs.

**What went wrong.** The third run came back wrapped in a fenced code block and `JSON.parse` threw. Later, a run returned `"level": "2"` where the code expected a number. Both are ordinary model behaviour, not malfunctions.

**Rejected.** The offered fix was a regex to strip fences before parsing. That is whack-a-mole: it handles the failure I had just seen and none of the ones I had not.

**Accepted instead.** The request goes through tool use with a declared input schema and `tool_choice` forcing the tool, so a structurally valid object is a property of the call rather than something to hope for. The return type stays `unknown` and a validator runs at the boundary.

The schema also fixes the field order — `criterionId`, then `level`, then the prose. Fields are generated in sequence, so committing to a level before writing the justification stops the justification from talking the model into a different level.

**Where.** `src/infrastructure/llm/AnthropicLlmClient.ts`, `src/domain/evaluators/LlmRubricEvaluator.ts`. Tests in `LlmRubricEvaluator.test.ts` cover a response that is not an object, an unknown criterion, an off-scale level, and a duplicate verdict.

---

## 2. The class that did not exist

**What went wrong.** The evaluator explained, at length and persuasively, why my `PaymentProcessor` violated single responsibility. There was no `PaymentProcessor` in the submission. This is the failure that worried me most, because the output looks exactly like real feedback.

**Suggested.** Add a line to the prompt: *only reference classes present in the submission.*

**Partly accepted.** I kept the line. It reduced the rate. It did not eliminate it, which is the general lesson I took from the whole build: **a prompt expresses a preference, a validator gives a guarantee.**

**Accepted instead.** `EvidenceResolver` runs over every finding before scoring. The policy took some thought and is not "drop anything suspicious":

- No evidence claimed at all → keep it. Deterministic findings are often about absence, and "no interfaces anywhere" has nothing to point at.
- Some evidence resolves → keep it, with the invented references stripped.
- Evidence claimed and none of it resolves → discard the whole finding, because the reasoning was about a design that does not exist.

Discards are counted and shown in the report footer rather than hidden. If the number is ever high, I want to see it.

**Where.** `src/domain/evaluation/EvidenceResolver.ts`, tested in `EvidenceResolver.test.ts`.

---

## 3. The score that meant nothing

**Suggested.** Score each criterion 1 to 10 and average them.

**What went wrong.** I ran the same submission three times and got 7, 8, 7. Then I ran a deliberately bad design — four classes, no interfaces, no stated responsibilities — and got 6. The scale had about two usable values and neither of them meant anything.

**Rejected.** The follow-up suggestion was to lower the temperature and ask for stricter scoring. Temperature 0 helped with run-to-run drift and did nothing about the clustering, because the clustering was not randomness. There was no anchor, so the model produced the average of everything it had ever read.

**Accepted instead.** Four ordinal levels, each written as an **observable behaviour** rather than an adjective. `L2` on responsibility clarity reads "every class states a responsibility and no class owns more than one reason to change", not "responsibilities are mostly clear". The model chooses between four written descriptors passed through verbatim from the rubric.

This matched what I found in the research: rubric ambiguity, not model quality, is where grader disagreement comes from, and levels defined by observable behaviour hold steady where evaluative words do not.

**Where.** `src/domain/rubric/rubrics/lldV1.ts`, `src/domain/rubric/Rubric.ts`.

---

## 4. Status derived from data instead of stored

**Suggested.** The generated schema had no status column on `evaluations`. Status was computed where it was needed:

```ts
const status = evaluation.report ? "done" : "pending";
```

**What went wrong.** That returns the same answer for "queued two seconds ago" and "failed after three retries". The UI cannot tell a slow evaluation from a dead one, retry has nothing to act on, and the failure is invisible because the code reads fine.

**Accepted instead.** An explicit enum with transitions guarded inside the aggregate. `complete()` throws unless the evaluation is `RUNNING`; `retry()` throws unless it is `FAILED` and under its cap. The guards throw rather than returning false, because a caller moving an evaluation from `QUEUED` straight to `COMPLETED` has a bug and silently tolerating it would hide the bug behind plausible data.

**Where.** `src/domain/evaluation/Evaluation.ts`. Eleven tests in `Evaluation.test.ts`, all of the interesting ones asserting that something is refused.

---

## 5. Four pollers in ten seconds

**Suggested.** The evaluation poller came back as a `setInterval` inside the component, with the fetched evaluation in the effect's dependency array.

**What went wrong.** Every poll set state. Setting state re-ran the effect. Re-running the effect started another interval and never cleared the old one. Within ten seconds there were four in flight, all hammering the same endpoint, and the request count in the dev server made it obvious.

**Accepted instead.** The effect is keyed on the evaluation **id**, which does not change while polling. The timer is chained after each response rather than fired on an interval, so a slow response cannot overlap the next request. Cleanup both clears the timer and flags in-flight responses as stale, so navigating away mid-poll cannot set state on a component that is gone. Polling stops at a terminal status.

The same stale-response guard is in the diagram renderer, for the same reason: Mermaid's render is async and the canvas re-renders on every keystroke, so without it a slow render from three keystrokes ago can land after a fast one.

A second problem showed up in the same component once I looked at the server-rendered HTML: the report page shipped a loading state and then polled for a report that had finished hours earlier. Everything reached from history is already terminal. The hook now takes a server-rendered snapshot and skips polling entirely when the evaluation is already finished, so opening an old review costs no round trip at all.

**Where.** `src/components/useEvaluationStatus.ts`, `src/components/Diagram.tsx`.

---

## 6. Two failures that survived review and were caught by running it

Both of these were in code I had read, tested, and believed. Neither was found by thinking harder; both were found by walking the actual flow.

**The idempotency key was global.** The constraint was `idempotency_key TEXT UNIQUE` across the whole submissions table. I re-ran my end-to-end script with the same hard-coded key against a *different* attempt, and the second attempt was handed the first attempt's evaluation. The duplicate-prevention had become a data leak between resources. The fix is `UNIQUE (attempt_id, idempotency_key)` and a lookup scoped to the attempt: two attempts using the same key are two different requests. There is now a test for exactly that.

**The seam check was reading prose.** Seam matching searched the class name, its methods, *and* its stated responsibility. Running the real flow, `ParkingLot` satisfied the seam for spot types, because its description happened to say "allocates spots". Matching now looks only at the name and method names. What a class **is** and **does** is structural; its description only records what its author was thinking about.

**I assumed a Mermaid feature existed instead of checking.** The change-test screen recolours the class diagram by impact, which needs `cssClass` inside a `classDiagram`. I grepped Mermaid's source to confirm it, found nothing, and concluded the headline visual was unsupported — I had grepped a file that only re-exports the parser. It is supported. Rather than trust either conclusion I wrote a test that runs the real Mermaid parser over real emitter output, including the escaped ids and the impact lines. That test is worth more than the answer, because it will still be there when Mermaid changes.

I am listing these because they are the honest answer to how much of this was AI-written. Quite a lot of it. The parts that needed a human were noticing that a passing test suite and a green typecheck were not the same as a correct system, and being willing to run the thing with deliberately awkward inputs.

---

## 7. Where I did not take the advice at all

- **`Promise.all` across evaluators.** The first pipeline failed the whole evaluation if any evaluator rejected, throwing away deterministic findings that had already succeeded. Changed to `Promise.allSettled`, so a dead model still yields the structural report. A partial report that says what is missing beats an error page.
- **A canned offline report.** The suggested no-API-key fallback returned fixed text. That would make the demo a lie: type a deliberately terrible design and be told it was fine. `HeuristicRubricEvaluator` derives levels from measurable properties of the actual submission instead, and is labelled `HEURISTIC` everywhere it appears.
- **A generic loading spinner.** Replaced with the real pipeline stages, written back as each evaluator settles. It is more honest and it demonstrates the architecture without a paragraph of explanation.
- **Colours picked by eye.** The first status palette looked fine and failed a contrast validator on the dark-mode lightness band, sitting at ΔE 10.7 under deuteranopia. Separating amber from red by hue rather than darkening everything got the worst adjacent pair to 12.5 under protanopia and 17.1 under normal vision, with all six checks passing. Two of the four still do not clear 4.5:1 as small text, so status colours are never the only carrier of state: every level and impact is written out next to its mark.
