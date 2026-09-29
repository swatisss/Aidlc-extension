# Stage: Units of work

Earlier artifacts (read these first):
{{previousArtifacts}}

Break the design into **units of work**. A unit is a cohesive, independently buildable and testable slice that code generation will implement in one iteration.

For each unit, give:
- An id (U1, U2…), a name, and a one-paragraph goal
- The stories and requirements it covers
- The files/modules it creates or changes
- Its dependencies on other units
- Its definition of done: tests that must pass and behaviour that must be demonstrable

Order the units so that dependencies come first, and prefer thin vertical slices that deliver value early. Include a Mermaid dependency graph.

Call `update_inventory` with `replace: true` and one item per unit: `id` = Ux, `kind: "unit"`, `priority` = its build order, `dependsOn`, `complexity`, and `status: "pending"`.

Write `inception/units-of-work.md`. Update the checklist, adding one "Code generation — Ux" item per unit, and call `request_approval`.
