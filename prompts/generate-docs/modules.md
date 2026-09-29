# Stage: Module docs

Follow the module map in `{{artifactRoot}}/_doc-plan.md`. Write `modules/<module-name>.md` for **each module the plan marks for generation this run**, and don't touch the rest.

Each module doc has these sections:
- **Purpose**: what the module is responsible for, and what it deliberately doesn't do.
- **Location**: its paths.
- **Key types & functions**: a table of name → signature → what it does → file:line. Only list things that exist.
- **How it works**: the internal flow, with a small Mermaid diagram if it helps.
- **Dependencies**: which modules it uses and which modules use it.
- **Configuration**: the env vars or config keys it reads.
- **Gotchas**: edge cases, invariants, surprising behaviour, TODOs you found in the code.
- **Testing**: where its tests live and what they cover.

Keep each doc under about 200 lines. Link related modules with relative links.

After writing each module doc, call `update_inventory` to set that module's status to `done`.

When you're done, call `request_approval` with the list of files written.
