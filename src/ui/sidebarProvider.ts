import * as vscode from 'vscode';
import type { RunManager } from '../runManager';
import type { HostToSidebar, SidebarToHost } from '../shared/types';
import { webviewHtml } from './webviewHtml';

/** "Workflows" sidebar view: workflow picker with input form, plus the run list. */
export class SidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'aidlc.sidebar';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly manager: RunManager,
    private readonly hasAuth: () => Promise<boolean>,
    private readonly openRun: (runId: string) => void,
  ) {
    manager.onDidChange(() => void this.post());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = webviewHtml(view.webview, this.extensionUri, 'sidebar', 'AIDLC');
    view.webview.onDidReceiveMessage(async (msg: SidebarToHost) => {
      switch (msg.type) {
        case 'ready':
          await this.post();
          break;
        case 'start':
          try {
            this.openRun(await this.manager.start(msg.workflowId, msg.inputs));
          } catch (err) {
            void vscode.window.showErrorMessage(`AIDLC: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
        case 'openRun':
          this.openRun(msg.runId);
          break;
        case 'setApiKey':
          await vscode.commands.executeCommand('aidlc.setApiKey');
          break;
      }
    });
  }

  async post(): Promise<void> {
    if (!this.view) return;
    const msg: HostToSidebar = {
      type: 'state',
      workflows: this.manager.listWorkflows(),
      runs: this.manager.listRuns(),
      hasAuth: await this.hasAuth(),
    };
    void this.view.webview.postMessage(msg);
  }
}
