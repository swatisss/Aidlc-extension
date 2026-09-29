# Stage: Review & index

1. Re-read every doc under `{{artifactRoot}}/` and check it against the code:
   - Broken relative links
   - Mermaid syntax errors
   - Claims that contradict the code
   - Invented commands or APIs

   Fix any problems with `write_artifact`.
2. Write `README.md`, an index of the documentation. It contains a one-paragraph system summary, a table of contents that links every doc with a one-line description, and a "last generated" note listing the scope and the date.
3. Call `request_approval` with a summary covering:
   - The docs written or updated this run
   - The docs skipped, and why
   - Anything you couldn't verify
   - Suggested follow-ups

The reviewer may ask for changes. Apply them to the relevant docs and request approval again.
