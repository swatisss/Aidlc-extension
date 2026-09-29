# Stage: Design & plan

Earlier artifacts (read these first):
{{previousArtifacts}}

Write `design.md`, containing:
- **Approach**: 1–2 paragraphs. If there's a real alternative, give it and say why you rejected it.
- **Changes**: a file-by-file list saying what will be added or modified and why. Name the existing functions to reuse.
- **Data, API and schema changes**, including the migration plan if any.
- **Test plan**: which tests prove which acceptance criteria.
- **Risks**, and the rollout plan (feature flag?) if relevant.
- **Implementation checklist**: ordered steps.

Keep the change as small as the spec allows. If a design decision is really the reviewer's to make, ask via `ask_user_question`.

Call `request_approval`. The reviewer approves the design before any code changes.
