# Stage: User stories

Earlier artifacts (read these first):
{{previousArtifacts}}

Derive user stories from the approved requirements.

- Identify the personas first, keeping the list short.
- Write stories in the form *As a <persona>, I want <capability>, so that <benefit>*, grouped into epics.
- Give each story Given/When/Then acceptance criteria and trace it to FR/NFR ids.
- Add a traceability table (story → requirements) and flag any requirement no story covers.
- Record a rough relative size (S/M/L) for each story, plus any dependencies between stories.

If a story can't be written without a product decision, ask the reviewer via `ask_user_question`.

Write `inception/user-stories.md`, update the checklist, and call `request_approval`.
