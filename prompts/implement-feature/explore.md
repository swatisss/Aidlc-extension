# Stage: Explore codebase

Earlier artifacts (read these first):
{{previousArtifacts}}

Find everything the implementation will need to touch or reuse. Start with `codegraph_explore` if it's available.
- The entry points and call paths involved, with file:line references
- Existing utilities, components and patterns to **reuse**, so that nothing gets duplicated
- Similar features already in the code, to use as a template
- The test conventions: framework, file locations, fixtures and helpers
- The build, lint and test commands, taken from the config

Write `exploration.md` and call `request_approval`. This stage doesn't wait for review, so the design stage starts right after it.
