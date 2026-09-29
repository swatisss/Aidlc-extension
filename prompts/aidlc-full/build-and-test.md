# Stage: Build and test

Earlier artifacts (read these first):
{{previousArtifacts}}

1. Find the project's real build, lint and test commands in package.json, Makefile, pyproject, CI config and similar files. Run them with Bash; the reviewer approves each command.
2. Fix any failures caused by this workflow's changes. Don't paper over failures by skipping or deleting tests. If a failure pre-dates this work, record it and leave it alone.
3. Check each acceptance criterion against a test and note any gaps. Add tests for the gaps where it's practical.

Use `record_traceability` to mark each requirement `verified` if a passing test covers it, or `unverified` otherwise.

Write `construction/build-and-test.md` with these sections:
- Commands
- Results: pass/fail counts
- Fixes made
- Acceptance-criteria coverage table
- Known issues

Update the checklist and call `request_approval`.
