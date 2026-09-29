# Stage: Architecture overview

Follow the approved `{{artifactRoot}}/_doc-plan.md`. If the plan says `architecture.md` is not being regenerated this run, call `request_approval` right away with a summary saying it was skipped.

Otherwise write `architecture.md`. It should contain:
- **Purpose**: what the system does and who uses it, in 2–4 sentences.
- **System context**: a Mermaid `flowchart` of the system, its users, and external services/datastores.
- **Components**: a Mermaid diagram of the main modules and their dependencies, followed by one short paragraph per component that links to `modules/<name>.md`.
- **Key flows**: 1–3 Mermaid `sequenceDiagram`s for the most important request/data paths. Trace them through the actual code and cite the files.
- **Cross-cutting concerns**: configuration, auth, error handling, logging, persistence and concurrency, as far as they apply.
- **Notable design decisions and tech debt** you observed.

Every claim must be backed by the code, so cite paths such as `src/foo/bar.ts`. Mermaid must be valid: quote any labels that contain special characters.

Then call `request_approval`.
