import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RunManager } from '../runManager';
import type { HostToPanel, PanelToHost } from '../shared/types';
import { webviewHtml } from './webviewHtml';

/** One editor panel per run: live agent stream, stage timeline, questions, permissions and gates. */
export class RunPanel implements vscode.Disposable {
  private static readonly panels = new Map<string, RunPanel>();
  private readonly disposables: vscode.Disposable[] = [];

  static show(extensionUri: vscode.Uri, manager: RunManager, cwd: string, runId: string): void {
    const existing = RunPanel.panels.get(runId);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    const runner = manager.runner(runId);
    if (!runner) {
      void vscode.window.showErrorMessage(`AIDLC: run ${runId} not found (was its workflow removed?)`);
      return;
    }
    const panel = vscode.window.createWebviewPanel('aidlc.run', runner.run.workflowName, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    });
    RunPanel.panels.set(runId, new RunPanel(panel, extensionUri, manager, cwd, runId));
  }

  static activeRunId(): string | undefined {
    return [...RunPanel.panels.values()].find((p) => p.panel.active)?.runId;
  }

  static isVisible(runId: string): boolean {
    return RunPanel.panels.get(runId)?.panel.visible ?? false;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly manager: RunManager,
    private readonly cwd: string,
    private readonly runId: string,
  ) {
    panel.webview.html = webviewHtml(panel.webview, extensionUri, 'runPanel', 'AIDLC Run');
    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((m: PanelToHost) => this.handle(m)),
      manager.onDidChange((id) => id === runId && this.postView()),
      manager.onDidEvent(({ runId: id, event }) => id === runId && this.post({ type: 'event', event })),
    );
  }

  private get runner() {
    return this.manager.runner(this.runId);
  }

  private async handle(m: PanelToHost): Promise<void> {
    const r = this.runner;
    if (!r) return;
    switch (m.type) {
      case 'ready':
        return this.postView();
      case 'approve':
        return r.approve(m.feedback, m.repeat);
      case 'revise':
        return r.revise(m.feedback);
      case 'reject':
        return r.reject(m.feedback);
      case 'stop':
        return r.stop();
      case 'resume':
        return r.resume();
      case 'answer':
        return r.answer(m.requestId, m.answers);
      case 'permission':
        return r.answerPermission(m.requestId, m.allow);
      case 'openArtifact': {
        const file = this.inWorkspace(m.path);
        if (!file) return;
        const cmd = file.endsWith('.md') ? 'markdown.showPreview' : 'vscode.open';
        await vscode.commands.executeCommand(cmd, vscode.Uri.file(file));
        return;
      }
      case 'readArtifact': {
        const file = this.inWorkspace(m.path);
        try {
          if (!file) throw new Error('outside the workspace');
          if (fs.statSync(file).size > 2_000_000) throw new Error('file too large to preview');
          this.post({ type: 'artifact', path: m.path, content: fs.readFileSync(file, 'utf8') });
        } catch (err) {
          this.post({ type: 'artifact', path: m.path, error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      case 'openLocation':
        await this.openRef(m.ref, m.beside ? vscode.ViewColumn.Beside : vscode.ViewColumn.One);
        return;
      case 'sideBySide':
        await this.openRef(m.left, vscode.ViewColumn.One);
        await this.openRef(m.right, vscode.ViewColumn.Two);
        return;
    }
  }

  private inWorkspace(rel: string): string | undefined {
    const file = path.resolve(this.cwd, rel);
    return file === this.cwd || file.startsWith(this.cwd + path.sep) ? file : undefined;
  }

  /** Open "path", "path:line" or "path:start-end" at that location. */
  private async openRef(ref: string, column: vscode.ViewColumn): Promise<void> {
    const m = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(ref.trim());
    const file = m && this.inWorkspace(m[1]);
    if (!m || !file || !fs.existsSync(file)) {
      void vscode.window.showWarningMessage(`AIDLC: can't open ${ref}`);
      return;
    }
    const start = Math.max(0, Number(m[2] ?? 1) - 1);
    const end = Math.max(start, Number(m[3] ?? m[2] ?? 1) - 1);
    const range = new vscode.Range(start, 0, end, 0);
    await vscode.window.showTextDocument(vscode.Uri.file(file), { viewColumn: column, selection: range, preview: false });
  }

  private postView(): void {
    const r = this.runner;
    if (!r) return;
    this.panel.title = `AIDLC · ${r.run.workflowName}`;
    this.post({ type: 'view', view: r.view() });
  }

  private post(msg: HostToPanel): void {
    void this.panel.webview.postMessage(msg);
  }

  dispose(): void {
    RunPanel.panels.delete(this.runId);
    for (const d of this.disposables) d.dispose();
  }
}
