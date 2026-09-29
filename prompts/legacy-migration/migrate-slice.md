# Stage: Migrate slice — iteration {{iteration}}

Every file written so far in this run:
{{previousArtifacts}}

You don't need to re-read all of these every iteration — they don't change once approved. For this slice you'll typically only need:
- `05-migration-plan.md`, to find the next slice and its dependencies;
- `02-business-rules.md`, only the BR ids this slice maps to;
- `04-strategy.md`, only the decisions that bear on this slice.

Skip `01-discovery.md` and `03-characterization-tests.md` unless something is genuinely unclear — you already have what you need from them via the plan and the tests you're keeping green.

Find the **next unchecked slice** from the checklist in `05-migration-plan.md` (or `{{docsFolder}}/aidlc-state.md`) and migrate **only that slice**. Don't read every earlier slice's log entry to figure out what's done — the checklist alone tells you.

1. Implement the slice in {{targetStack}}, following the strategy: adapters, flags and coexistence rules. Preserve every business rule mapped to this slice. Keep the characterization tests passing, and don't weaken them to make them pass.
2. Remove or retire the legacy code only when the plan says this slice owns its removal.
3. If the slice turns out bigger or riskier than planned, stop and ask via `ask_user_question` whether to split it.
4. Bash isn't pre-approved in this stage. If you need to run the tests or the build, request it; the reviewer approves each command. Otherwise, list the exact commands the reviewer should run.
5. Write **only this slice's own log entry** as a new file `06-migration-log/{{iteration}}-<slice-id>.md` using `write_artifact`. Don't read or rewrite earlier slices' log files — each slice's entry is independent. Include:
   - the files changed
   - the rules preserved
   - the test status
   - deviations from the plan
   - follow-ups
6. Tick the slice in the checklist.
7. Keep the structured views current:
   - Call `update_inventory` to mark this slice's items `in_progress` when you start and `done` when you finish, or `blocked` with a note.
   - Call `record_traceability` for each rule in the slice with `target` set to its new `path:line` and `status: "implemented"`. If the reviewer decided to change a rule's behaviour, use `changed`.

Call `request_approval` with `hasMore: true` if slices remain, or `false` if this was the last. List every file changed.
