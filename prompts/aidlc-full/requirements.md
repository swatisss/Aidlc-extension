# Stage: Requirements analysis

**Request:** {{requirement}}

Earlier artifacts (read these first):
{{previousArtifacts}}

Turn the request into clear, testable requirements.

1. Find what's ambiguous or missing: users and roles, scope boundaries, data, integrations, non-functional needs (performance, security, accessibility, compliance), and success criteria.
2. Ask the reviewer about these with **one** batched `ask_user_question` call of up to about 8 focused questions, with options where possible. Skip anything you can already answer from the code or the request.
3. Write `inception/requirements.md` with these sections:
   - Overview & goals
   - In scope / out of scope
   - Functional requirements: numbered FR-1, FR-2… each with acceptance criteria
   - Non-functional requirements: NFR-1…
   - Constraints & assumptions: mark each assumption as such
   - Open questions
4. Record every FR and NFR with `record_traceability`: `id` = FR-n or NFR-n, a one-line `description`, and `status: "extracted"`.
5. Update the checklist, then call `request_approval`.
