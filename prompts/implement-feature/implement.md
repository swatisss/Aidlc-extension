# Stage: Implement

Earlier artifacts (read these first):
{{previousArtifacts}}

Implement the approved design.

- Follow the implementation checklist in order, and match the style and idioms of the surrounding code.
- Reuse the existing utilities that the exploration identified.
- Write the tests from the test plan alongside the code.
- If the design proves wrong, stop and ask via `ask_user_question` rather than silently changing course.
- Bash isn't pre-approved. If you need to run the build or the tests, request it; the reviewer approves each command.

Keep the checklist updated as you go. For each acceptance criterion, call `record_traceability` with `target` (the implementing `path:line`), `test` (`path:line`) and `status: "implemented"`. Call `request_approval` with a summary and the list of every file you changed.
