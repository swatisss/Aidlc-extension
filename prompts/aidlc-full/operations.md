# Stage: Deployment & operations

Earlier artifacts (read these first):
{{previousArtifacts}}

Prepare the change for release, based on how this repo actually deploys: CI workflows, Dockerfiles, IaC, release scripts. If none exist, say so and give minimal recommendations.

Write `operations/deployment.md` with these sections:
- Release checklist: config and env vars, migrations, feature flags
- Deployment steps and rollback plan
- Observability: logs, metrics and alerts to add or watch
- Post-release verification steps
- Summary of the whole run: what was built, with links to all AIDLC artifacts

Mark the whole checklist complete, then call `request_approval`.
