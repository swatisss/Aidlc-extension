# Stage: Clarify requirements

**Feature:** {{feature}}
**Constraints:** {{constraints}}

Turn the request into an unambiguous spec. Don't design or code yet.

1. Skim the code just enough to understand the domain terms the request uses.
2. Find the gaps: behaviour in edge cases, the UX/API surface, data changes, permissions, backwards compatibility, and what "done" looks like. Ask about them in **one** batched `ask_user_question` call with options where possible, and skip anything you can answer yourself.
3. Write `spec.md` with these sections:
   - Summary
   - User-visible behaviour
   - Acceptance criteria: a numbered, testable checklist
   - Out of scope
   - Assumptions
   - Open questions

Record each acceptance criterion with `record_traceability`: `id` = AC-n, the criterion as the `description`, and `status: "extracted"`.

Call `request_approval`.
