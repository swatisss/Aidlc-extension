// Types shared by the extension host (engine + UI providers) and the webviews.

export type WorkflowInput = {
  id: string;
  label: string;
  type: 'text' | 'multiline' | 'choice';
  options?: string[];
  default?: string;
  required?: boolean;
};

export type StageDef = {
  id: string;
  name: string;
  /** Optional grouping, e.g. inception / construction / operations. */
  phase?: string;
  /** Path of the stage prompt, relative to the prompts/ folder. */
  prompt: string;
  /** Model for this stage; falls back to the workspace's aidlc.model setting when unset. */
  model?: string;
  /** Tools auto-approved for this stage (SDK allowedTools). */
  tools: string[];
  /** Tools that are never available in this stage (SDK disallowedTools). */
  deny?: string[];
  /** Artifacts (relative to the docs folder) the stage is expected to write. */
  artifacts?: string[];
  /** Pause for human approval when the stage finishes. */
  gate: boolean;
  /** Stage may be repeated (e.g. one migration slice per iteration). */
  repeat?: boolean;
};

export type WorkflowDef = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  inputs: WorkflowInput[];
  stages: StageDef[];
  /** Record the git HEAD at completion so the next run can be incremental. */
  trackGitSha?: boolean;
  /**
   * Folder write_artifact writes into, as a template over the inputs,
   * {{docsFolder}} and {{runId}}. Defaults to the docs folder.
   */
  artifactRoot?: string;
};

export type StageStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'skipped';

export type StageState = {
  id: string;
  status: StageStatus;
  iteration: number;
  sessionId?: string;
  costUsd: number;
  /** Latest cumulative cost reported by the current SDK session. */
  sessionCostUsd?: number;
  summary?: string;
  artifacts: string[];
  hasMore?: boolean;
  error?: string;
};

export type RunStatus =
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_input'
  | 'paused'
  | 'completed'
  | 'rejected'
  | 'failed'
  | 'stopped';

export type ItemStatus = 'pending' | 'in_progress' | 'done' | 'verified' | 'blocked' | 'skipped';

/** One thing the workflow tracks: a legacy program, module, unit of work, doc… */
export type InventoryItem = {
  id: string;
  name: string;
  /** e.g. program, copybook, job, module, service, unit, doc */
  kind: string;
  path?: string;
  loc?: number;
  complexity?: 'low' | 'medium' | 'high';
  /** 1 = highest */
  priority?: number;
  status: ItemStatus;
  dependsOn?: string[];
  notes?: string;
};

export type TraceStatus = 'extracted' | 'implemented' | 'verified' | 'changed' | 'unverified';

/** Links a business rule / requirement to where it lives in legacy code, new code and tests. */
export type TraceEntry = {
  id: string;
  description: string;
  /** "path/to/file.ext:line" */
  source?: string;
  target?: string;
  test?: string;
  status: TraceStatus;
};

export type RunState = {
  id: string;
  workflowId: string;
  workflowName: string;
  inputs: Record<string, string>;
  status: RunStatus;
  currentStage: number;
  stages: StageState[];
  inventory?: InventoryItem[];
  traces?: TraceEntry[];
  createdAt: string;
  updatedAt: string;
};

export type QuestionSpec = {
  id: string;
  question: string;
  options?: string[];
  multiSelect?: boolean;
};

/** The event shapes producers (agentSession, codegraph) construct, before the runner stamps `seq`. */
export type AgentEventKind =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: string }
  | { kind: 'tool_result'; id: string; isError: boolean; text: string }
  | { kind: 'result'; costUsd: number; turns: number; isError: boolean; text: string }
  | { kind: 'info'; text: string }
  | { kind: 'error'; text: string };

/** A live event produced while a stage runs. Not persisted. `seq` is a stable React list key. */
export type AgentEvent = AgentEventKind & { seq: number };

export type PendingQuestion = { requestId: string; questions: QuestionSpec[] };
export type PendingPermission = { requestId: string; toolName: string; input: string };

export type RunView = {
  run: RunState;
  workflow: Pick<WorkflowDef, 'id' | 'name' | 'icon' | 'stages'>;
  events: AgentEvent[];
  pendingQuestion?: PendingQuestion;
  pendingPermission?: PendingPermission;
};

export type WorkflowSummary = Pick<WorkflowDef, 'id' | 'name' | 'description' | 'icon' | 'inputs'> & {
  /** Ordered distinct phases (or stage names when a workflow has no phases). */
  phases: string[];
  stageCount: number;
  gateCount: number;
};

export type RunSummary = Pick<RunState, 'id' | 'workflowName' | 'status' | 'currentStage' | 'updatedAt'> & {
  workflowId: string;
  stageCount: number;
  /** Stages approved so far. */
  stagesDone: number;
  costUsd: number;
  label: string;
  icon?: string;
  /** Inventory progress, when the workflow tracks items. */
  items?: { total: number; done: number };
};

// ---- webview <-> host protocol ----

export type SidebarToHost =
  | { type: 'ready' }
  | { type: 'start'; workflowId: string; inputs: Record<string, string> }
  | { type: 'openRun'; runId: string }
  | { type: 'setApiKey' };

export type HostToSidebar = {
  type: 'state';
  workflows: WorkflowSummary[];
  runs: RunSummary[];
  hasAuth: boolean;
};

export type PanelToHost =
  | { type: 'ready' }
  | { type: 'approve'; feedback?: string; repeat?: boolean }
  | { type: 'revise'; feedback: string }
  | { type: 'reject'; feedback?: string }
  | { type: 'stop' }
  | { type: 'resume' }
  | { type: 'answer'; requestId: string; answers: Record<string, string> }
  | { type: 'permission'; requestId: string; allow: boolean }
  | { type: 'openArtifact'; path: string }
  /** Ask the host for a file's content to preview inside the panel. */
  | { type: 'readArtifact'; path: string }
  /** Open "path:line" in an editor. */
  | { type: 'openLocation'; ref: string; beside?: boolean }
  /** Open legacy and new code side by side. */
  | { type: 'sideBySide'; left: string; right: string };

export type HostToPanel =
  | { type: 'view'; view: RunView }
  | { type: 'event'; event: AgentEvent }
  | { type: 'artifact'; path: string; content?: string; error?: string };
