# Stage: Workspace detection

**Request:** {{requirement}}
**Declared project type:** {{projectType}}

Work out what kind of workspace this is before any planning happens.

1. Survey the repository: languages, frameworks, build tooling, test setup, folder layout, entry points and existing docs (README, CLAUDE.md, ADRs).
2. Classify it as **greenfield** (empty or scaffold-only) or **brownfield** (real existing code). If the declared type conflicts with what you find, note the conflict.
3. For brownfield code, record the conventions later stages must follow: naming, module boundaries, error handling, test style and lint config.
4. List the areas of the code the request is likely to touch.

Write `inception/workspace-analysis.md` with these sections: Summary · Classification · Tech stack · Structure (with a Mermaid diagram if it helps) · Conventions · Likely impact areas · Risks & unknowns.

Then initialise the checklist with `update_plan_checklist`, listing every stage of this workflow: workspace detection, requirements, user stories, application design, units of work, functional design, code generation, build and test, operations. Tick the first one.

Finish with `request_approval`.
