# Research note

*What learners actually need, what the existing tools do, and where the gap is.*

## The learner problem

Low-level design is easy to start and hard to finish, because finishing means knowing whether what you produced was any good.

A learner can sit down with Parking Lot, produce eight classes in twenty minutes, and have no way to tell whether those eight classes are a reasonable decomposition or a mess that happens to compile. There is no test suite to go green. There is no reference answer that means anything, because the whole discipline admits several correct shapes for the same problem. Hello Interview's own preparation guide puts it plainly: there usually is not a right answer in low-level design.

So the learner falls back on the two things available. They read someone else's solution and pattern-match against it, which teaches them that solution rather than the skill. Or they ask a model whether their design is good, and get told it is thoughtful and well-structured, which is worth nothing.

What is missing is not content. There is plenty of content. What is missing is a way to find out that your design is worse than it looks.

## What exists

I looked at six tools currently serving this market: Hello Interview, Codemia, InstaMock, Coudo AI, LLD Problems, and Low Level Design Mastery. There is also an active Show HN for a visual-first LLD playground, which suggests the space is still being worked on.

They differ in content depth, in polish, and in price. They do not differ in method. Every one of them runs the same loop:

| Stage | What they all do |
| --- | --- |
| Practice | Pick a problem from a catalogue, work in a whiteboard, an editor, or a chat |
| Submission | A diagram, a code file, or a transcript of an explanation |
| Feedback | An LLM scores the submission against dimensions and writes comments |
| Loop | Scores are stored; some show a history |

The strongest of them, Hello Interview, adds a step-by-step interviewer and a rubric shaped by people who have conducted these interviews, moving through requirements, entities, API, and deep dives. Codemia adds peer mock interviews. InstaMock adds real-time feedback on classic problems. These are real differences in quality. None of them is a difference in *what question is being asked of the model*.

## The gap

Every tool grades the design you wrote. None of them tests it.

That matters because grading runs straight into the problem the discipline already admits. If several designs are correct, then "how good is this design" has no stable answer, and asking a language model for one produces exactly the failure you would predict. Two things go wrong, and both are documented in the research on rubric-based LLM evaluation:

**Scores drift and cluster.** When rubric levels are described with adjectives — "responsibilities are mostly clear", "good separation of concerns" — the grader improvises. The literature on evaluation rubrics is direct about this: weak anchors are the common failure, and reviewers, human or machine, are inconsistent when dimensions overlap or when levels are defined by evaluative words rather than observable behaviour. In practice everything lands at 7 out of 10.

**Feedback stops being checkable.** A model asked an open question about a design will produce fluent criticism of a design it partly invented. I hit this within the first hour of building: the evaluator confidently explained why my `PaymentProcessor` violated single responsibility, in a submission that contained no such class.

The research also points at the fix. Levels defined by observable behaviour hold steady, and concrete anchors measurably reduce a judge's tendency to overrate vague or shallow work. Rubric ambiguity, not model capability, is where the disagreement comes from.

## The question that does have an answer

There is one question about a design that stays answerable even when several designs are valid:

> When the requirements change, what does this design have to touch?

Industry already has a name for the answer. **Blast radius** is the set of files, functions, and services that must change when one change ships, and reducing it is what isolation and clean boundaries are actually for. A well-factored system has a small, predictable blast radius; a tangled one does not.

This is also what a senior reviewer is really probing in an interview. Not "did you name the same six classes I would have", but "you have put pricing inside `ParkingLot`, so what happens in six months when we add per-minute charging".

Crucially, it is measurable without a reference solution. Give the learner a requirement they have not seen, ask which of *their own* classes it forces open, and count. Any correct design should absorb it cheaply. An incorrect one will not, whatever shape it took.

## Product direction

Crucible runs the ordinary loop and then does the thing nobody else does.

**Round one** is a rubric, built the way the research says to build one. Six criteria, four levels each, and every level written as something two readers would agree on. "Every class states a responsibility and no class owns more than one reason to change" — not "responsibilities are mostly clear". Every criticism must cite a class the learner actually wrote, and one that does not is discarded rather than shown.

**Round two** is the change test. A requirement the learner has never seen arrives. They mark which of their classes it forces open and what they would add. Blast radius is computed from that, compared against a par set by the problem author, and scored. It is arithmetic, not opinion, and it is the only criterion in the rubric a model cannot overrule.

That split is the product's position on where AI belongs. Two of six criteria are counted. Four are judged, because reading whether two stated responsibilities are really one job needs comprehension. The report says which is which on every criterion, so the learner never has to guess whether a number was measured or estimated.

## What this deliberately does not do

It does not run code, hold mock interviews, or maintain a content library, and it has no accounts. Four problems and one rubric are enough to demonstrate whether the change test teaches something a score cannot. If it does not, more content would not have saved it.

## Sources

- [Hello Interview — Low Level Design guided practice](https://www.hellointerview.com/practice/low-level-design) and [How to prepare for a low-level design interview](https://www.hellointerview.com/blog/how-to-prepare-lld)
- [Codemia](https://codemia.io/) — system and object-oriented design practice with AI feedback
- [InstaMock LLD](https://instamock.in/lld), [Coudo AI](https://www.coudo.ai/), [LLD Problems](https://www.lldproblems.com/), [Low Level Design Mastery](https://www.lowleveldesignmastery.com/)
- [Show HN: an interactive playground to practice LLD interviews](https://news.ycombinator.com/item?id=46541117)
- [Rubric Is All You Need: improving LLM-based code evaluation with question-specific rubrics](https://dl.acm.org/doi/10.1145/3702652.3744220), ICER 2025
- [LLM evaluation rubrics: anchoring and reviewer calibration](https://www.twine.net/blog/llm-evaluation-rubrics/)
- [Blast radius in software engineering: what it is, how to measure it, how to contain it](https://riftmap.dev/blog/blast-radius-software-engineering/)
