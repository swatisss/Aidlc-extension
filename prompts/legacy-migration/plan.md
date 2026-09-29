# Stage: Migration plan (slices)

Earlier artifacts (read these first):
{{previousArtifacts}}

Break the approved strategy into **small, independently shippable slices**. After each slice the system must build, pass its characterization tests, and be deployable.

For each slice (S1, S2…), give:
- Its goal and the legacy files/modules it touches
- The target files it creates
- The business rules (BR ids) and characterization tests that protect it
- Its dependencies on other slices
- Its definition of done
- Its rollback note
- A size (S/M/L). Split anything that's L.

If `codegraph_explore` is available, use it to check what each slice's changes would affect and to confirm the dependencies between slices.

Order the slices to reduce risk: start with scaffolding and shared infrastructure, then leaf modules, and leave the core and most-coupled code for last. Include a Mermaid gantt or dependency graph.

Call `update_inventory` to set each item's `priority` (its slice order: 1 = first) and `notes` (e.g. "Slice S2: …").

Write `05-migration-plan.md`, including a checklist of every slice. Initialise the progress checklist with `update_plan_checklist`, then call `request_approval`.
