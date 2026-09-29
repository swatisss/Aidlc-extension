# Stage: Target architecture & migration strategy

Earlier artifacts (read these first):
{{previousArtifacts}}

**Migrating:** {{sourceStack}} → {{targetStack}}
**Constraints:** {{constraints}}

Design where the system is going and how to get there **safely and incrementally**.

1. **Target architecture:** a Mermaid diagram of the end state, with a mapping table from each legacy module to its target module, and how each business rule moves across.
2. **Strategy:** compare the viable options, such as:
   - a strangler fig (new code alongside old, routing traffic gradually);
   - branch by abstraction;
   - a module-by-module rewrite behind the existing interfaces;
   - an automated codemod plus manual clean-up;
   - a big-bang rewrite, which you should justify only if the system is small.

   Recommend one and give the reasons. Ask the reviewer via `ask_user_question` if the choice depends on their constraints (downtime tolerance, team skills, deadlines).
3. **Coexistence:** how old and new code run side by side during the migration: adapters, feature flags, shared data access, and build changes.
4. **Dependency replacements:** each legacy library → its target equivalent, with notes on API differences.
5. **Risks & rollback:** what could go wrong, how you'd detect it, and how you'd roll back each step.

Write `04-strategy.md` and call `request_approval`. This is a key decision gate.
