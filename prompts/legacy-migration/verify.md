# Stage: Verification report

Earlier artifacts (read these first):
{{previousArtifacts}}

Prove the migration preserved behaviour.

1. Run the full build, the characterization tests and the existing test suite. Use Bash; the reviewer approves each command. Record the exact commands and their results.
2. Walk through every business rule in `02-business-rules.md` and mark it: verified by a test, verified by inspection, changed intentionally (with the reviewer's decision), or **unverified**.
3. Look for leftovers: legacy dependencies still installed, dead adapters and flags that are ready to be removed, and TODOs added during the migration.
4. Recommend the next steps: removing flags, a monitoring plan for rollout, and performance comparisons to run.

Record the results with `record_traceability`, using `verified` or `unverified` for each rule. Call `update_inventory` to set the verified items to `verified`.

Write `07-verification-report.md`. Mark the checklist complete and call `request_approval`.
