import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { changedSince, headSha } from './engine/git';
import { newRun, WorkflowRunner, type AgentBackend } from './engine/runner';
import { RunStore } from './engine/state';
import { render } from './engine/template';
import { loadWorkflows } from './engine/workflowLoader';
import type { AgentEvent, RunState, RunSummary, WorkflowDef, WorkflowSummary } from './shared/types';

type Settings = { docsFolder: string; autoApprove: boolean };

/** Owns every run in the workspace: creates runners, rehydrates persisted runs, fans out change events. */
export class RunManager implements vscode.Disposable {
  private readonly runners = new Map<string, WorkflowRunner>();
  private workflows: WorkflowDef[] = [];
  private readonly store: RunStore;
  private readonly changeEmitter = new vscode.EventEmitter<string | undefined>();
  private readonly eventEmitter = new vscode.EventEmitter<{ runId: string; event: AgentEvent }>();
  /** Fires with a runId when that run changed, or undefined when the list/workflows changed. */
  readonly onDidChange = this.changeEmitter.event;
  readonly onDidEvent = this.eventEmitter.event;

  constructor(
    private readonly extensionDir: string,
    private readonly cwd: string,
    private readonly backend: AgentBackend,
    private readonly settings: () => Settings,
  ) {
    this.store = new RunStore(path.join(cwd, '.aidlc', 'runs'));
    this.reloadWorkflows();
  }

  reloadWorkflows(): void {
    this.workflows = loadWorkflows([
      path.join(this.extensionDir, 'workflows'),
      path.join(this.cwd, '.aidlc', 'workflows'),
    ]);
    this.changeEmitter.fire(undefined);
  }

  listWorkflows(): WorkflowSummary[] {
    return this.workflows.map(({ id, name, description, icon, inputs, stages }) => {
      const phases = [...new Set(stages.map((s) => s.phase ?? s.name))];
      return { id, name, description, icon, inputs, phases, stageCount: stages.length, gateCount: stages.filter((s) => s.gate).length };
    });
  }

  workflow(id: string): WorkflowDef | undefined {
    return this.workflows.find((w) => w.id === id);
  }

  listRuns(): RunSummary[] {
    const live = new Map([...this.runners.values()].map((r) => [r.run.id, r.run]));
    const stored = this.store.list().map((r) => live.get(r.id) ?? r);
    return stored.map((r) => {
      const inv = r.inventory ?? [];
      return {
        id: r.id,
        workflowId: r.workflowId,
        workflowName: r.workflowName,
        icon: this.workflow(r.workflowId)?.icon,
        status: r.status,
        currentStage: r.currentStage,
        updatedAt: r.updatedAt,
        stageCount: r.stages.length,
        stagesDone: r.stages.filter((s) => s.status === 'approved').length,
        costUsd: r.stages.reduce((s, x) => s + x.costUsd, 0),
        label: Object.values(r.inputs)[0]?.slice(0, 80) ?? '',
        items: inv.length ? { total: inv.length, done: inv.filter((i) => i.status === 'done' || i.status === 'verified').length } : undefined,
      };
    });
  }

  /** Runner for a run that is live in this window, without touching disk. */
  liveRunner(runId: string): WorkflowRunner | undefined {
    return this.runners.get(runId);
  }

  /** Runner for a run, rehydrating it from disk if needed. */
  runner(runId: string): WorkflowRunner | undefined {
    const existing = this.runners.get(runId);
    if (existing) return existing;
    const run = this.store.list().find((r) => r.id === runId);
    const wf = run && this.workflow(run.workflowId);
    if (!run || !wf) return undefined;
    return this.createRunner(wf, run, {});
  }

  async start(workflowId: string, inputs: Record<string, string>): Promise<string> {
    const wf = this.workflow(workflowId);
    if (!wf) throw new Error(`Unknown workflow "${workflowId}"`);
    const vars = wf.trackGitSha ? await this.incrementalVars(wf) : {};
    const run = newRun(wf, inputs);
    const runner = this.createRunner(wf, run, vars);
    this.changeEmitter.fire(undefined);
    // Run in the background; the UI follows along through events.
    void runner.start();
    return run.id;
  }

  dispose(): void {
    for (const r of this.runners.values()) r.stop();
    this.changeEmitter.dispose();
    this.eventEmitter.dispose();
  }

  private createRunner(wf: WorkflowDef, run: RunState, vars: Record<string, string>): WorkflowRunner {
    const { docsFolder, autoApprove } = this.settings();
    const artifactRoot =
      render(wf.artifactRoot ?? '{{docsFolder}}', { ...run.inputs, docsFolder, runId: run.id }).replace(/\/+$/, '') || docsFolder;
    const runner = new WorkflowRunner({
      workflow: wf,
      run,
      backend: this.backend,
      store: this.store,
      cwd: this.cwd,
      docsFolder,
      artifactRoot,
      promptsDir: path.join(this.extensionDir, 'prompts'),
      autoApprove,
      vars,
      onChange: () => this.changeEmitter.fire(run.id),
      onEvent: (event) => this.eventEmitter.fire({ runId: run.id, event }),
      onComplete: wf.trackGitSha ? () => this.recordSha(wf) : undefined,
    });
    this.runners.set(run.id, runner);
    return runner;
  }

  private shaFile(wf: WorkflowDef): string {
    return path.join(this.cwd, '.aidlc', 'state', `${wf.id}.json`);
  }

  private async incrementalVars(wf: WorkflowDef): Promise<Record<string, string>> {
    const file = this.shaFile(wf);
    const last = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { sha?: string }).sha : undefined;
    const changed = last ? await changedSince(this.cwd, last) : undefined;
    if (!last || !changed) {
      return { lastRunSha: '', changedFiles: '(first run — document everything in scope)' };
    }
    return {
      lastRunSha: last,
      changedFiles: changed.length ? changed.map((f) => `- ${f}`).join('\n') : '(no files changed since the last run)',
    };
  }

  private async recordSha(wf: WorkflowDef): Promise<void> {
    const sha = await headSha(this.cwd);
    if (!sha) return;
    fs.mkdirSync(path.dirname(this.shaFile(wf)), { recursive: true });
    fs.writeFileSync(this.shaFile(wf), JSON.stringify({ sha, at: new Date().toISOString() }, null, 2));
  }
}
