# Stage: Discovery & inventory

**Migrating:** {{sourceStack}} → {{targetStack}}
**Scope:** `{{scope}}`
**Constraints:** {{constraints}}

Before anything changes, build an accurate picture of the legacy system. Do **not** modify any code in this stage.

1. **Inventory:**
   - Languages, frameworks and library versions, taken from the lockfiles and manifests
   - Build and deploy tooling
   - Runtime versions
   - Entry points
   - Size of the code in scope: file counts per area
2. **Dependency graph:** build it from `codegraph_explore` if that tool is available, and from imports otherwise.
   - How the internal modules depend on each other; draw this as a Mermaid graph
   - External dependencies that have no equivalent in {{targetStack}}, or are end-of-life
3. **Legacy patterns & tech debt:**
   - Deprecated APIs, global state, tight coupling, dead code and copy-paste
   - Missing tests and hidden side effects: I/O, time, randomness, DB triggers
   - Rank each finding by migration risk.
4. **Existing safety net:** which tests exist, how you run them (from the config), and a rough idea of what they cover.
5. **Unknowns:** ask the reviewer via `ask_user_question` about anything the code can't tell you, such as production traffic patterns, integrations that are no longer used, or behaviours that must be preserved exactly.

Call `update_inventory` with `replace: true` and one item for every unit in scope. Units include programs, copybooks and includes, batch jobs (JCL or scripts), screens or maps, DB tables and files, and modules. Give each item:
- `kind`
- `path`
- `loc`
- `complexity` (low/medium/high)
- `dependsOn`: the ids it calls, includes or reads
- `status: "pending"`

Write `01-discovery.md` and call `request_approval`.
