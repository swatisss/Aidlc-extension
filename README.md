# AIDLC for VS Code

Run **AI-Driven Development Lifecycle** workflows inside VS Code, powered by the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript). Pick a workflow in the sidebar, answer the agent's clarifying questions, and approve or revise each stage. The agent writes its reviewable artifacts (requirements, designs, plans, docs) into your repo as it goes.

Inspired by [aidlc-io/aidlc](https://github.com/aidlc-io/aidlc) and the legacy-modernisation approach in *"Modernize, Migrate, and Maintain: Upgrading Legacy Codebase with Claude Code"*.

## Workflows

| Workflow | What it does |
|---|---|
| 🔁 **Full AIDLC** | **Inception:** workspace detection → requirements (with clarifying questions) → user stories → application design → units of work. **Construction:** functional design → code generation, one unit per iteration → build & test. **Operations:** deployment & ops notes. |
| 📚 **Generate documentation** | Read-only. Plans the docs, then writes the architecture overview (Mermaid), per-module docs, API reference, onboarding guide and an index. Re-runs are incremental: only docs affected by files changed since the last run are regenerated. |
| 🏗️ **Legacy code migration** | Discovery & inventory → reverse-engineer business rules → characterization tests → target architecture & strategy → migration plan in slices → migrate slice by slice → verification report. |
| ✨ **Implement a feature** | Clarify → explore → design → implement → test & self-review → PR summary. |

Every stage runs in a **fresh agent session**. The only context it gets is the earlier approved artifacts, which keeps token use predictable. Stages marked ⛩ stop for your review, where you can:

- **Approve & continue**: start the next stage. Feedback is optional and gets carried forward.
- **Approve & next iteration**: available on repeatable stages (code-gen units, migration slices) while work remains.
- **Request changes**: resume the *same* session with your feedback.
- **Reject**: end the run.

Everything is logged to `aidlc-docs/audit.md`. A progress checklist is kept in `aidlc-docs/aidlc-state.md`.

## The UI

- **Sidebar**: shows *Needs you* (runs waiting on a review or an answer) and *In progress*, each with progress, item counts and cost. Below that are workflow cards that show each workflow's phases (e.g. Understand → Safety net → Plan → Migrate → Verify), with a start form, then *History*.
- **Run panel**: a header with a progress bar and phase stepper, a stage list with cost per stage, and these tabs:
  - **Activity**: a plain-language feed ("Read PAYROLL01.cbl", "Explored the code graph…", "Ran mvn test"). Expand any line to see the raw tool input and output.
  - **Review**: questions, permission requests and stage gates. The summary renders as Markdown, and you can preview each artifact inline, Mermaid diagrams included, before you approve or request changes. The panel switches here automatically when the agent needs you.
  - **Portfolio**: the inventory the agent maintains (programs, copybooks, jobs, modules, units…), with stats, sorting and filtering, and an interactive **dependency graph** coloured by status.
  - **Traceability**: each rule or requirement linked to its legacy source, new code and test, with a coverage bar. **⇆ Compare** opens the legacy and new code side by side.
  - **Documents**: every artifact grouped by stage, with an inline preview.
- **Status bar and notifications**: "AIDLC: 1 needs you" in the status bar, plus a notification when a stage is ready for review, the agent has a question, or a tool needs approval while the panel is hidden.

## Safety model

- Each stage declares which tools are **pre-approved** (e.g. `Read`, `Glob`, `Grep`) and which are **denied** (planning and docs stages can't `Edit` or `Write` source files).
- Any other tool call, such as a `Bash` command during build & test, pops up an **Allow / Deny** card in the run panel.
- Agent deliverables go through the `write_artifact` tool. It is confined to the workflow's artifact folder and rejects `../` escapes.
- Each stage has turn and cost caps (`aidlc.maxTurnsPerStage`, `aidlc.maxBudgetUsdPerStage`). **Stop** aborts the agent immediately, and **Resume** continues the same session.

## Getting started

1. `npm install`
2. Press **F5**. This builds the extension and launches an Extension Development Host.
3. In the new window, open a project and run **AIDLC: Set Anthropic API Key**. Alternatively, set `aidlc.provider` to `bedrock` or `vertex` to use your cloud credentials.
4. Open the **AIDLC** activity-bar view, pick a workflow, fill in the form and click **Start**.

Artifacts appear in the **Artifacts** view and open in Markdown preview. Install [Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid) to render the diagrams.

Runs are persisted in `.aidlc/runs/`. After a window reload, use **AIDLC: Resume Run** or click the run in the sidebar.

## Settings

| Setting | Default | |
|---|---|---|
| `aidlc.model` | `claude-opus-5-5` | Model for all stages |
| `aidlc.provider` | `anthropic` | `anthropic` \| `bedrock` \| `vertex` |
| `aidlc.docsFolder` | `aidlc-docs` | Where AIDLC artifacts, the audit log and the state checklist live |
| `aidlc.autoApprove` | `false` | Skip approval gates (unattended runs) |
| `aidlc.maxTurnsPerStage` | `40` | Agent turn cap per stage |
| `aidlc.maxBudgetUsdPerStage` | `5` | Spend cap per stage |

## Code understanding with CodeGraph (built in)

[CodeGraph](https://github.com/colbymchenry/codegraph) (MIT) is bundled with the extension and used by every stage. There's nothing to install or enable. It indexes the repo with tree-sitter into a SQLite graph of symbols, calls, imports and inheritance, and gives the agent a read-only `codegraph_explore` MCP tool. The agent then answers structural questions in one call instead of reading file after file. Questions like "how does X work", "what calls Y" and "what does changing Z affect" are the ones that benefit.

- **Index:** the first stage in a workspace builds the index in `.codegraph/`, which ignores itself in git. Every later stage syncs it incrementally, so edits from earlier stages are included.
- **Runtime:** CodeGraph runs on its own bundled Node runtime, so the version of Node on your machine doesn't matter.
- **Other platforms:** if the `.vsix` was built for a different platform, CodeGraph downloads the matching build from its GitHub releases on first use.
- **Failures:** if CodeGraph can't start or can't index, you get a warning and the stage continues without it.
- **Telemetry:** the extension launches CodeGraph with its anonymous telemetry **off** (`CODEGRAPH_TELEMETRY=0`). If you set `CODEGRAPH_TELEMETRY` yourself, your value wins.

## Custom workflows

A workflow is a YAML file plus Markdown stage prompts. To add or override one in a repo, drop a YAML into `.aidlc/workflows/`. It is hot-reloaded, and a file with the same `id` as a built-in workflow replaces it.

```yaml
id: mindmap
name: Codebase mindmap
description: Generate a Mermaid mindmap of the codebase.
artifactRoot: "{{docsFolder}}/mindmap"   # write_artifact target; may use inputs, {{docsFolder}}, {{runId}}
inputs:
  - { id: scope, label: Folder to map, type: text, default: "." }
stages:
  - id: map
    name: Build mindmap
    prompt: mindmap/map.md       # relative to the extension's prompts/ folder
    tools: [Read, Glob, Grep]    # pre-approved
    deny: [Edit, Write, Bash]    # never available
    gate: true                   # stop for review
    repeat: false                # true → "Approve & next iteration"
```

These variables are available in prompt templates:

- every input id
- `{{docsFolder}}` and `{{artifactRoot}}`
- `{{iteration}}`
- `{{previousArtifacts}}`
- `{{expectedArtifacts}}`
- `{{changedFiles}}` and `{{lastRunSha}}`, when `trackGitSha: true`

## Architecture

```
src/
  extension.ts            activation, commands, auth/env
  runManager.ts           creates/rehydrates runs, fans out events, incremental-docs git SHA
  engine/                 (no vscode dependency — unit-tested)
    workflowLoader.ts     YAML → WorkflowDef with validation; repo overrides
    runner.ts             stage state machine, gates, revise/resume, questions, permissions, audit log
    agentSession.ts       Claude Agent SDK backend: query() options, message → event mapping
    tools/aidlcTools.ts   in-process MCP server: ask_user_question, write_artifact, request_approval, update_plan_checklist
    permissions.ts        canUseTool → UI approval
    codegraph.ts          optional CodeGraph index: init/sync + stdio MCP server config
    state.ts              .aidlc/runs/*.json persistence
  ui/                     sidebar webview, run panel, artifact tree
  webview/                React UIs (bundled by esbuild)
workflows/*.yaml          built-in workflows
prompts/**.md             stage prompts + _common.md operating rules
```

## Development

```bash
npm run build      # esbuild: dist/extension.js + dist/webview/*.js
npm run watch
npm run typecheck
npm test           # vitest — engine tests with a fake agent backend
npm run package    # .vsix for the current platform
```

The Agent SDK is ESM-only. It ships its Claude Code binary as a platform-specific optional dependency, so it is kept external to the bundle and shipped in `node_modules`. That makes a `.vsix` **platform-specific**: build one per target (`vsce package --target darwin-arm64`, `linux-x64`, `win32-x64`, …) from a matching `npm install`.

## Roadmap

- Mindmap workflow (Mermaid `mindmap` of the codebase or requirements), rendered in a webview
- Artifact annotation/review inline in the editor
- Git-branch backend for sharing run state across a team
