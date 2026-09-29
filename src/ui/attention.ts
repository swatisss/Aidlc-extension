import * as vscode from 'vscode';
import type { RunManager } from '../runManager';
import { RunPanel } from './runPanel';

/**
 * Surfaces runs that need the user: a status bar item summarising them, and a
 * notification when a run starts waiting while its panel isn't visible.
 */
export class AttentionTracker implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  private readonly lastState = new Map<string, string>();
  private readonly disposables: vscode.Disposable[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private target?: string;

  constructor(
    private readonly manager: RunManager,
    private readonly openRun: (runId: string) => void,
  ) {
    this.disposables.push(
      this.item,
      manager.onDidChange((runId) => {
        if (runId) this.check(runId);
        this.scheduleStatusBar();
      }),
      vscode.commands.registerCommand('aidlc.openAttention', () => this.target && this.openRun(this.target)),
    );
    this.item.command = 'aidlc.openAttention';
    this.scheduleStatusBar();
  }

  private check(runId: string): void {
    const runner = this.manager.liveRunner(runId);
    if (!runner) return;
    const { run, pendingPermission } = runner.view();
    const state = pendingPermission ? `perm:${pendingPermission.requestId}` : run.status;
    if (this.lastState.get(runId) === state) return;
    this.lastState.set(runId, state);
    if (RunPanel.isVisible(runId)) return;

    const stage = run.stages[run.currentStage];
    const stageName = runner.view().workflow.stages[run.currentStage]?.name ?? stage.id;
    const open = async (p: Thenable<string | undefined>) => {
      if (await p) this.openRun(runId);
    };
    if (pendingPermission) {
      void open(vscode.window.showWarningMessage(`AIDLC: the agent wants to use ${pendingPermission.toolName} (${run.workflowName}).`, 'Review'));
    } else if (run.status === 'awaiting_approval') {
      void open(vscode.window.showInformationMessage(`AIDLC: "${stageName}" is ready for your review.`, 'Review'));
    } else if (run.status === 'awaiting_input') {
      void open(vscode.window.showInformationMessage(`AIDLC: the agent has questions about "${stageName}".`, 'Answer'));
    } else if (run.status === 'completed') {
      void open(vscode.window.showInformationMessage(`AIDLC: ${run.workflowName} completed.`, 'Open'));
    } else if (run.status === 'failed') {
      void open(vscode.window.showErrorMessage(`AIDLC: "${stageName}" failed: ${stage.error ?? 'unknown error'}`, 'Open'));
    }
  }

  private scheduleStatusBar(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.updateStatusBar(), 300);
  }

  private updateStatusBar(): void {
    const runs = this.manager.listRuns();
    const waiting = runs.filter(
      (r) =>
        r.status === 'awaiting_approval' ||
        r.status === 'awaiting_input' ||
        this.manager.liveRunner(r.id)?.view().pendingPermission !== undefined,
    );
    const running = runs.filter((r) => r.status === 'running');
    if (waiting.length) {
      this.target = waiting[0].id;
      this.item.text = `$(bell-dot) AIDLC: ${waiting.length} need${waiting.length === 1 ? 's' : ''} you`;
      this.item.tooltip = waiting.map((r) => `${r.workflowName} — ${r.status.replace('_', ' ')}`).join('\n');
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.show();
    } else if (running.length) {
      this.target = running[0].id;
      this.item.text = `$(sync~spin) AIDLC: ${running[0].workflowName} · stage ${running[0].currentStage + 1}/${running[0].stageCount}`;
      this.item.tooltip = 'Open the running AIDLC workflow';
      this.item.backgroundColor = undefined;
      this.item.show();
    } else {
      this.target = undefined;
      this.item.hide();
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const d of this.disposables) d.dispose();
  }
}
