# Stage: Onboarding guide

Follow `{{artifactRoot}}/_doc-plan.md`. If the plan skips onboarding this run, call `request_approval` saying so.

Otherwise write `onboarding.md` for a new developer:
- **Prerequisites**: runtime versions (from `.nvmrc`, `engines`, `pyproject`, `go.mod`, Dockerfiles…) and required services.
- **Setup**: clone, install, env vars (from `.env.example` or config loaders) and seed data.
- **Everyday commands**: build, run, test, lint and format. Copy these **exactly** from package.json scripts, the Makefile, or the tooling config. Never invent a command. If you can't find how to do something, say so.
- **Project layout**: a short tour that links to `architecture.md` and the module docs.
- **Workflow**: branching, commit and PR conventions, and CI checks, as far as the repo reveals them.
- **Troubleshooting**: known pitfalls you saw in the code, issues or comments.

Then call `request_approval`.
