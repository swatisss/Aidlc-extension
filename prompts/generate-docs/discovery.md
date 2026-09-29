# Stage: Discovery & documentation plan

**Scope:** `{{scope}}`  ·  **Audience:** {{audience}}  ·  **Output folder:** `{{artifactRoot}}/`

**Files changed since the last documentation run:**
{{changedFiles}}

You are documenting existing code. You have **read-only** access; the only way to write is `write_artifact`, whose paths are relative to `{{artifactRoot}}/`.

1. Survey the code in scope: tech stack, entry points, build and config files, top-level modules and packages, and external integrations. Read the existing docs, and note what's missing or stale.
2. Draw up a module map of 5–25 logical modules. If `codegraph_explore` is available, base the map and its dependencies on it. For each, give its paths and a one-line purpose.
3. If this is an **incremental run** (a list of changed files is shown above), work out which modules and docs are affected. Plan to regenerate only those, and leave the rest untouched. If `{{artifactRoot}}/` has no docs yet, treat this as a first run.
4. Tailor depth to the audience. For "All of the above", produce every doc type.

Call `update_inventory` with `replace: true` and one item per module: `kind: "module"`, `path`, `loc`, `dependsOn`, and `status: "pending"`. Use `"skipped"` for modules left out of this run.

Write `_doc-plan.md` with these sections:
- Tech stack
- Module map: a table of module → paths → purpose → the doc file it gets, e.g. `modules/<name>.md`
- Docs to generate this run, and the ones deliberately skipped
- Open questions for the reviewer

Call `request_approval`. The reviewer confirms the plan before any docs get written.
