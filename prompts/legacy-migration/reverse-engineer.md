# Stage: Reverse-engineer business rules

Earlier artifacts (read these first):
{{previousArtifacts}}

Legacy code usually encodes business rules that nobody wrote down. Extract them so the migration keeps them intact.

For each module in scope, record:
- **Business rules**: validation, calculations, state transitions, permissions and defaults. Cite each rule's file:line and give it an id (BR-1…).
- **Implicit behaviour**: ordering, rounding, time zones, encoding, null and empty handling, error messages that clients may depend on, and side effects.
- **External contracts**: APIs, file formats, DB schemas and message formats that other systems consume. These must stay compatible unless the reviewer says otherwise.
- **Suspicious behaviour**: things that look like bugs. Don't fix them. List them, and ask the reviewer via `ask_user_question` whether each should be kept bug-for-bug or corrected during the migration.

Record every rule with `record_traceability`, giving `id` = the BR id, a one-line `description`, `source` = `path:line`, and `status: "extracted"`.

Write `02-business-rules.md`, with a summary table of rule id → module → description → source. Call `request_approval`.
