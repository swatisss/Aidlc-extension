# Stage: Test & self-review

Earlier artifacts (read these first):
{{previousArtifacts}}

1. Run the lint, typecheck and tests, requesting Bash for each command; the reviewer approves them. Fix the failures that come from this change.
2. Review your own diff the way a strict reviewer would. Check for:
   - correctness in edge cases
   - error handling
   - security (injection, authz, secrets)
   - performance
   - naming and dead code
   - missing tests for any acceptance criterion

   Fix what you find.
3. Write `review.md` with these sections:
   - Commands run and their results
   - Acceptance criteria → test mapping
   - Issues found and fixed
   - Remaining concerns

Use `record_traceability` to mark each AC `verified` if a passing test covers it, or `unverified` otherwise.

Call `request_approval`.
