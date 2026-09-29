import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AgentEvent,
  AgentEventKind,
  InventoryItem,
  TraceEntry,
  PendingPermission,
  PendingQuestion,
  QuestionSpec,
  RunState,
  RunView,
  StageDef,
  WorkflowDef,
} from '../shared/types';
import { render } from './template';
import type { RunStore } from './state';

/** Callbacks the agent's in-process tools use to talk to the runner. */
export interface StageHost {
  /** Workspace-relative folder write_artifact writes into. */
  readonly artifactRoot: string;
  askUser(questions: QuestionSpec[]): Promise<Record<string, string>>;
  requestApproval(summary: string, artifacts: string[], hasMore: boolean): void;
  /** Writes under the run's artifact root; returns the workspace-relative path. */
  writeArtifact(relPath: string, content: string): string;
  updateChecklist(markdown: string): void;
  requestPermission(toolName: string, input: Record<string, unknown>): Promise<boolean>;
  /** Upsert tracked items by id (replace=true drops items not in the list). Returns the new total. */
  updateInventory(items: InventoryItem[], replace: boolean): number;
  /** Upsert traceability links by id. Returns the new total. */
  recordTraces(entries: TraceEntry[]): number;
}

/** Merge `updates` into `list` by id; fields not given in an update keep their old values. */
export function upsertById<T extends { id: string }>(list: T[], updates: T[], replace = false): T[] {
  const byId = new Map((replace ? [] : list).map((x) => [x.id, x]));
  const previous = new Map(list.map((x) => [x.id, x]));
  for (const u of updates) {
    const prev = byId.get(u.id) ?? previous.get(u.id);
    const clean = Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined && v !== null)) as T;
    byId.set(u.id, prev ? { ...prev, ...clean } : clean);
  }
  return [...byId.values()];
}

export type StageRequest = {
  cwd: string;
  stage: StageDef;
  systemAppend: string;
  prompt: string;
  resumeSessionId?: string;
  host: StageHost;
  signal: AbortSignal;
};

export type StageResult = { sessionId?: string; costUsd: number; isError: boolean; text: string };

/** Abstraction over the Claude Agent SDK so the runner can be tested without it. */
export interface AgentBackend {
  runStage(req: StageRequest, onEvent: (e: AgentEventKind) => void): Promise<StageResult>;
}

export type RunnerOptions = {
  workflow: WorkflowDef;
  run: RunState;
  backend: AgentBackend;
  store: RunStore;
  cwd: string;
  /** Workspace-relative folder for AIDLC state/audit files (aidlc-docs). */
  docsFolder: string;
  /** Workspace-relative folder that write_artifact writes into. */
  artifactRoot: string;
  promptsDir: string;
  autoApprove: boolean;
  /** Extra template variables (e.g. changedFiles for incremental docs). */
  vars?: Record<string, string>;
  onChange: () => void;
  onEvent: (e: AgentEvent) => void;
  onComplete?: (run: RunState) => void | Promise<void>;
};

type Approval = { summary: string; artifacts: string[]; hasMore: boolean };

const MAX_EVENTS = 1000;
const COMMON_PROMPT = '_common.md';

export function newRun(workflow: WorkflowDef, inputs: Record<string, string>): RunState {
  const now = new Date().toISOString();
  const id = `${workflow.id}-${now.replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    workflowId: workflow.id,
    workflowName: workflow.name,
    inputs,
    status: 'paused',
    currentStage: 0,
    stages: workflow.stages.map((s) => ({ id: s.id, status: 'pending', iteration: 1, costUsd: 0, artifacts: [] })),
    createdAt: now,
    updatedAt: now,
  };
}

export class WorkflowRunner {
  readonly events: AgentEvent[] = [];
  private abort?: AbortController;
  private pendingQuestion?: PendingQuestion & { resolve: (a: Record<string, string>) => void };
  private pendingPermission?: PendingPermission & { resolve: (ok: boolean) => void };
  private approval?: Approval;
  private seq = 0;
  private eventSeq = 0;

  constructor(private readonly o: RunnerOptions) {}

  get run(): RunState {
    return this.o.run;
  }

  get busy(): boolean {
    return this.abort !== undefined;
  }

  view(): RunView {
    const { id, name, icon, stages } = this.o.workflow;
    const strip = <T extends { resolve: unknown }>(p?: T) => {
      if (!p) return undefined;
      const { resolve: _r, ...rest } = p;
      return rest;
    };
    return {
      run: this.run,
      workflow: { id, name, icon, stages },
      events: this.events,
      pendingQuestion: strip(this.pendingQuestion),
      pendingPermission: strip(this.pendingPermission),
    };
  }

  // ---- user actions ----

  async start(): Promise<void> {
    this.audit(`Run started: ${this.o.workflow.name}\n\nInputs:\n${Object.entries(this.run.inputs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`);
    await this.executeStage();
  }

  async approve(feedback?: string, repeat = false): Promise<void> {
    if (this.busy || this.run.status !== 'awaiting_approval') return;
    const def = this.stageDef;
    const st = this.stageState;
    if (repeat && def.repeat) {
      this.audit(`Approved "${def.name}" iteration ${st.iteration}; repeating.${feedback ? `\n\nFeedback: ${feedback}` : ''}`);
      st.iteration += 1;
      st.sessionId = undefined;
      await this.executeStage(feedback);
      return;
    }
    this.audit(`Approved "${def.name}".${feedback ? `\n\nFeedback: ${feedback}` : ''}`);
    st.status = 'approved';
    await this.advance(feedback);
  }

  async revise(feedback: string): Promise<void> {
    if (this.busy || this.run.status !== 'awaiting_approval') return;
    this.audit(`Revision requested for "${this.stageDef.name}":\n\n${feedback}`);
    await this.executeStage(feedback, true);
  }

  reject(feedback?: string): void {
    if (this.busy || this.run.status !== 'awaiting_approval') return;
    this.audit(`Rejected "${this.stageDef.name}". Run ended.${feedback ? `\n\nReason: ${feedback}` : ''}`);
    this.stageState.status = 'rejected';
    this.run.status = 'rejected';
    this.persist();
  }

  stop(): void {
    if (!this.abort) return;
    this.abort.abort();
    this.pendingQuestion?.resolve({});
    this.pendingPermission?.resolve(false);
  }

  async resume(): Promise<void> {
    if (this.busy || !['paused', 'stopped', 'failed'].includes(this.run.status)) return;
    const st = this.stageState;
    await this.executeStage(undefined, st.sessionId !== undefined);
  }

  answer(requestId: string, answers: Record<string, string>): void {
    const p = this.pendingQuestion;
    if (!p || p.requestId !== requestId) return;
    this.pendingQuestion = undefined;
    this.run.status = 'running';
    this.audit(`Answers:\n${p.questions.map((q) => `- ${q.question} → ${answers[q.id] ?? '(no answer)'}`).join('\n')}`);
    p.resolve(answers);
    this.persist();
  }

  answerPermission(requestId: string, allow: boolean): void {
    const p = this.pendingPermission;
    if (!p || p.requestId !== requestId) return;
    this.pendingPermission = undefined;
    p.resolve(allow);
    this.o.onChange();
  }

  // ---- internals ----

  private get stageDef(): StageDef {
    return this.o.workflow.stages[this.run.currentStage];
  }

  private get stageState() {
    return this.run.stages[this.run.currentStage];
  }

  private async advance(feedback?: string): Promise<void> {
    this.run.currentStage += 1;
    if (this.run.currentStage >= this.run.stages.length) {
      this.run.currentStage = this.run.stages.length - 1;
      this.run.status = 'completed';
      this.audit('Run completed.');
      this.persist();
      await this.o.onComplete?.(this.run);
      return;
    }
    await this.executeStage(feedback ? `(Carried over from the previous stage's approval) ${feedback}` : undefined);
  }

  private async executeStage(feedback?: string, resume = false): Promise<void> {
    const def = this.stageDef;
    const st = this.stageState;
    st.status = 'running';
    st.error = undefined;
    this.run.status = 'running';
    this.approval = undefined;
    this.abort = new AbortController();
    this.persist();
    this.emit({ kind: 'info', text: `▶ ${def.name}${st.iteration > 1 ? ` (iteration ${st.iteration})` : ''}${resume ? ' — resuming session' : ''}` });

    // The SDK reports cumulative cost per session (a resumed session includes its
    // earlier turns), so stage cost = cost of finished sessions + latest total of this one.
    const baseCost = st.costUsd - (resume ? (st.sessionCostUsd ?? 0) : 0);
    if (!resume) st.sessionCostUsd = 0;

    let result: StageResult;
    try {
      result = await this.o.backend.runStage(
        {
          cwd: this.o.cwd,
          stage: def,
          systemAppend: this.readPrompt(COMMON_PROMPT),
          prompt: this.buildPrompt(def, feedback, resume),
          resumeSessionId: resume ? st.sessionId : undefined,
          host: this.host(),
          signal: this.abort.signal,
        },
        (e) => {
          if (e.kind === 'result') {
            st.sessionCostUsd = e.costUsd;
            st.costUsd = baseCost + e.costUsd;
          }
          this.emit(e);
        },
      );
    } catch (err) {
      result = { costUsd: 0, isError: true, text: err instanceof Error ? err.message : String(err) };
    }
    const aborted = this.abort.signal.aborted;
    this.abort = undefined;
    if (result.sessionId) st.sessionId = result.sessionId;

    if (aborted) {
      st.status = 'pending';
      this.run.status = 'stopped';
      this.emit({ kind: 'info', text: '■ Stopped. Resume to continue this stage.' });
      this.audit(`Stopped during "${def.name}".`);
      this.persist();
      return;
    }
    if (result.isError) {
      st.status = 'failed';
      st.error = result.text;
      this.run.status = 'failed';
      this.emit({ kind: 'error', text: result.text });
      this.audit(`Stage "${def.name}" failed: ${result.text}`);
      this.persist();
      return;
    }

    // Set by the request_approval tool during the stage; TS can't see that mutation.
    const approval = this.approval as Approval | undefined;
    st.summary = approval?.summary || result.text;
    st.hasMore = approval?.hasMore ?? false;
    for (const a of approval?.artifacts ?? []) if (!st.artifacts.includes(a)) st.artifacts.push(a);
    this.audit(`Stage "${def.name}" finished.\n\n${st.summary}`);

    if (def.gate && !this.o.autoApprove) {
      st.status = 'awaiting_approval';
      this.run.status = 'awaiting_approval';
      this.persist();
      return;
    }
    if (def.repeat && st.hasMore) {
      st.iteration += 1;
      st.sessionId = undefined;
      await this.executeStage();
      return;
    }
    st.status = 'approved';
    await this.advance();
  }

  private buildPrompt(def: StageDef, feedback: string | undefined, resume: boolean): string {
    if (resume) {
      return feedback
        ? `The reviewer asked for changes to this stage. Apply them, update the affected artifacts, then call request_approval again.\n\nReviewer feedback:\n${feedback}`
        : 'Continue this stage from where you left off, then call request_approval.';
    }
    const earlier = this.run.stages
      .slice(0, this.run.currentStage + 1)
      .flatMap((s) => s.artifacts)
      .map((a) => `- ${a}`)
      .join('\n');
    const vars: Record<string, string | number> = {
      ...this.run.inputs,
      ...this.o.vars,
      workflowName: this.o.workflow.name,
      stageName: def.name,
      iteration: this.stageState.iteration,
      docsFolder: this.o.docsFolder,
      artifactRoot: this.o.artifactRoot,
      previousArtifacts: earlier || '(none yet)',
      expectedArtifacts: (def.artifacts ?? []).map((a) => `- ${a}`).join('\n') || '(none)',
    };
    let prompt = render(this.readPrompt(def.prompt), vars);
    if (feedback) prompt += `\n\n## Reviewer notes\n${feedback}`;
    return prompt;
  }

  private readPrompt(rel: string): string {
    const file = path.join(this.o.promptsDir, rel);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  }

  private host(): StageHost {
    return {
      artifactRoot: this.o.artifactRoot,
      askUser: (questions) =>
        new Promise((resolve) => {
          this.pendingQuestion = { requestId: this.nextId(), questions, resolve };
          this.run.status = 'awaiting_input';
          this.persist();
        }),
      requestPermission: (toolName, input) =>
        new Promise((resolve) => {
          this.pendingPermission = {
            requestId: this.nextId(),
            toolName,
            input: JSON.stringify(input, null, 2).slice(0, 4000),
            resolve,
          };
          this.o.onChange();
        }),
      requestApproval: (summary, artifacts, hasMore) => {
        this.approval = { summary, artifacts, hasMore };
      },
      writeArtifact: (relPath, content) => {
        const rel = this.safeJoin(this.o.artifactRoot, relPath);
        const abs = path.join(this.o.cwd, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
        const st = this.stageState;
        if (!st.artifacts.includes(rel)) st.artifacts.push(rel);
        this.persist();
        return rel;
      },
      updateInventory: (items, replace) => {
        this.run.inventory = upsertById(this.run.inventory ?? [], items, replace);
        this.persist();
        return this.run.inventory.length;
      },
      recordTraces: (entries) => {
        this.run.traces = upsertById(this.run.traces ?? [], entries);
        this.persist();
        return this.run.traces.length;
      },
      updateChecklist: (markdown) => {
        const abs = path.join(this.o.cwd, this.o.docsFolder, 'aidlc-state.md');
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, `# AIDLC State — ${this.o.workflow.name}\n\nRun: ${this.run.id}\n\n${markdown}\n`);
      },
    };
  }

  /** Resolve `rel` under `root`, rejecting anything that escapes it. Returns a workspace-relative path. */
  private safeJoin(root: string, rel: string): string {
    let cleanRel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    const rootNorm = path.posix.normalize(root.replace(/\\/g, '/'));
    // Agents often repeat the root's last folder ("migration/x.md" under ".../migration");
    // without this the file lands in ".../migration/migration/x.md".
    const leaf = path.posix.basename(rootNorm);
    if (!cleanRel.startsWith(`${rootNorm}/`) && cleanRel.startsWith(`${leaf}/`)) cleanRel = cleanRel.slice(leaf.length + 1);
    // Accept paths the agent already prefixed with the root.
    const joined = path.posix.normalize(
      cleanRel.startsWith(`${rootNorm}/`) ? cleanRel : path.posix.join(rootNorm, cleanRel),
    );
    if (joined !== rootNorm && !joined.startsWith(`${rootNorm}/`)) {
      throw new Error(`Artifact path "${rel}" escapes ${root}/`);
    }
    return joined;
  }

  private audit(text: string): void {
    const abs = path.join(this.o.cwd, this.o.docsFolder, 'audit.md');
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (!fs.existsSync(abs)) fs.writeFileSync(abs, '# AIDLC Audit Log\n');
      fs.appendFileSync(abs, `\n## ${new Date().toISOString()} — ${this.run.id}\n\n${text}\n`);
    } catch {
      // Audit is best-effort; never fail a stage because of it.
    }
  }

  private emit(e: AgentEventKind): void {
    const stamped: AgentEvent = { ...e, seq: ++this.eventSeq };
    this.events.push(stamped);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.o.onEvent(stamped);
  }

  private persist(): void {
    this.run.updatedAt = new Date().toISOString();
    this.o.store.save(this.run);
    this.o.onChange();
  }

  private nextId(): string {
    return `${this.run.id}:${++this.seq}`;
  }
}
