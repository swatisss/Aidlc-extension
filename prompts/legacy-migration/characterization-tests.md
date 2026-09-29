# Stage: Characterization tests

Earlier artifacts (read these first):
{{previousArtifacts}}

Pin down the **current** behaviour with characterization (golden-master) tests. These tests are the contract the migrated code must satisfy.

1. Pick the highest-risk business rules and external contracts from `02-business-rules.md`.
2. Write tests with the existing test framework, following the repo's test layout. If the repo has no test framework, propose the lightest one that fits via `ask_user_question` before adding it. The tests should:
   - assert what the code **does today**, including known quirks, and not what it should do;
   - call the code through stable seams (public functions, HTTP endpoints, CLI) so they survive the migration;
   - isolate time, randomness and I/O with fixtures.
3. Never change production code in this stage. If a seam is missing, record it as a risk.
4. Tell the reviewer the exact command to run the tests. You can't run Bash in this stage; test execution happens in the verify stage and by the reviewer.

For each rule you covered, call `record_traceability` with its `test` set to `path:line`. Leave the status as `extracted`, because the rule hasn't been migrated yet.

Write `03-characterization-tests.md` with these sections:
- Test files added
- Rule id → test mapping
- How to run
- Uncovered rules and why

Call `request_approval`, listing every test file you created.
