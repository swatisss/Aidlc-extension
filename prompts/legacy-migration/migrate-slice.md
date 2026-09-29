# Stage: Migrate slice — iteration {{iteration}}

Earlier artifacts (read these first):
{{previousArtifacts}}

Read `06-migration-log.md` if it exists: it lists the slices already done. Take the **next slice** from `05-migration-plan.md`, and migrate **only that slice**.

1. Implement the slice in {{targetStack}}, following the strategy: adapters, flags and coexistence rules. Preserve every business rule mapped to this slice. Keep the characterization tests passing, and don't weaken them to make them pass.
2. Remove or retire the legacy code only when the plan says this slice owns its removal.
3. If the slice turns out bigger or riskier than planned, stop and ask via `ask_user_question` whether to split it.
4. Bash isn't pre-approved in this stage. If you need to run the tests or the build, request it; the reviewer approves each command. Otherwise, list the exact commands the reviewer should run.
5. Update `06-migration-log.md` using `write_artifact`. Rewrite the whole file, keeping the earlier entries, and add this slice with:
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
