# Stage: Migration plan (slices)

Earlier artifacts (read these first):
{{previousArtifacts}}

Break the approved strategy into **independently shippable slices**. After each slice the system must build, pass its characterization tests, and be deployable.

**Size slices to the codebase, not to a fixed notion of "small."** Every slice is a full separate reviewed iteration — its own agent session, its own gate, its own re-sync of the code index — so more slices means more overhead, not more safety. For a small codebase (roughly a few thousand lines or fewer, or a handful of legacy programs), prefer one slice per legacy program or shared component; don't split a module into multiple slices just because it *could* be divided further. Reserve fine-grained splitting for genuinely large or high-risk modules, where a smaller reviewable diff is worth the extra iteration.

For each slice (S1, S2…), give:
- Its goal and the legacy files/modules it touches
- The target files it creates
- The business rules (BR ids) and characterization tests that protect it
- Its dependencies on other slices
- Its definition of done
- Its rollback note
- A size (S/M/L). Split an L slice only if it's genuinely large in absolute terms (hundreds of lines / several distinct responsibilities) — not merely the largest slice in a small plan.

If `codegraph_explore` is available, use it to check what each slice's changes would affect and to confirm the dependencies between slices.

Order the slices to reduce risk: start with scaffolding and shared infrastructure, then leaf modules, and leave the core and most-coupled code for last. Include a Mermaid gantt or dependency graph.

Call `update_inventory` to set each item's `priority` (its slice order: 1 = first) and `notes` (e.g. "Slice S2: …").

Write `05-migration-plan.md`, including a checklist of every slice. Initialise the progress checklist with `update_plan_checklist`, then call `request_approval`.
