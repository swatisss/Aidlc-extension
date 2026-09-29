# Stage: Application design

Earlier artifacts (read these first):
{{previousArtifacts}}

Produce the high-level design. For a brownfield workspace, fit into the existing architecture and conventions and don't replace them.

Write `inception/application-design.md` covering:
- **Architecture overview**: a Mermaid component diagram showing new vs. changed vs. existing components.
- **Components**: the responsibility and interface of each (public functions/endpoints/events), with a file/module location.
- **Data model**: entities, schema changes and migrations.
- **Key flows**: a Mermaid sequence diagram for the 2–3 most important stories.
- **Cross-cutting concerns**: auth, error handling, logging/observability, configuration.
- **Decisions**: short ADR-style entries (context → decision → consequences) for each significant choice, including the alternatives you rejected.
- **Risks**, with a mitigation for each.

Where the choice is genuinely the reviewer's (e.g. build vs. buy, which datastore), ask via `ask_user_question` rather than deciding silently.

Update the checklist and call `request_approval`.
