# Stage: Code generation — iteration {{iteration}}

Earlier artifacts (read these first):
{{previousArtifacts}}

Implement **one unit of work per iteration**. Read `construction/code-generation-log.md` if it exists: it lists the units already done. Pick the next unit in dependency order from `inception/units-of-work.md`.

1. Implement the unit exactly as the functional design describes, using Edit/Write in the real source tree. Follow the repo's conventions and keep changes minimal and focused.
2. Write the unit's tests alongside the code.
3. If the design turns out to be wrong or incomplete, stop and ask via `ask_user_question` rather than improvising a different design.
4. Append a section for this unit to `construction/code-generation-log.md`, keeping the earlier sections. Write the whole file with `write_artifact` and include: the unit id, the files changed, notable decisions, deviations from the design, and follow-ups.
5. Update the checklist and the structured views:
   - `update_inventory`: set the unit to `in_progress` when you start and `done` when you finish.
   - `record_traceability`: for each FR the unit implements, set `target` to `path:line`, `test` to `path:line`, and `status: "implemented"`.
6. Call `request_approval` with `hasMore: true` if more units remain, or `false` if this was the last one. List every source file you changed in `artifacts`.
