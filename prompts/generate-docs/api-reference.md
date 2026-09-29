# Stage: API reference

Follow `{{artifactRoot}}/_doc-plan.md`. If the plan skips the API reference this run, or the code exposes no public API, call `request_approval` saying so.

Otherwise write `api-reference.md`, drawn **only** from the code:
- **HTTP/RPC endpoints**: method, path, auth, request and response shape, error codes, and the handler's file:line. Take these from routers, controllers, OpenAPI files and proto files.
- **Public library API**: the exported functions and classes, with their signatures and a short description.
- **CLI commands, events and messages**: include these if the code has them.

Use examples only where they can be derived from tests or fixtures, and cite the source. If something is ambiguous, mark it *unverified* rather than guessing.

Then call `request_approval`.
