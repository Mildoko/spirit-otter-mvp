# Repository Instructions

Before changing experience-critical behavior, read `docs/product-experience-constitution-v1.md` completely.

Experience-critical behavior includes routing, guidance state, prompts, character cards, response style, reply validation, static and safety responses, actions, followups, memory injection, Eval datasets or Judges, and user-facing dialogue interaction.

For every experience-critical change:

1. Identify the affected `EX-*` invariants in the change description.
2. Preserve the priority order: safety and reality boundaries, core experience, product policy, then Eval metrics.
3. Never optimize a non-safety Eval score by weakening user control, concrete emotional acknowledgment, character continuity, low-pressure transition, single-action authorization, non-coercive followup, capability honesty, privacy, or exit rights.
4. Do not change gold labels, frozen samples, thresholds, or Judge prompts merely to make the current implementation pass. Such changes require product evidence, an explicit rationale, and a versioned migration note.
5. Keep subjective experience marked for manual review. Do not convert unmeasured experience into an automatic pass or zero.
6. Run the relevant automated regressions. User-visible language, transition, action, or followup changes also require the review in `docs/product-experience-review-template.md` before claiming experience validation is complete.

Safety failures always block. If Eval improves while core experience regresses, stop release and inspect both the implementation and the measurement design.
