import * as path from 'node:path';
import * as vscode from 'vscode';
import { SdkBackend } from './engine/agentSession';
import { CodeGraph, resolveBundledCodeGraph } from './engine/codegraph';
import { RunManager } from './runManager';
import { ArtifactTreeProvider } from './ui/artifactTree';
import { AttentionTracker } from './ui/attention';
import { RunPanel } from './ui/runPanel';
import { SidebarProvider } from './ui/sidebarProvider';

const API_KEY_SECRET = 'aidlc.anthropicApiKey';

const config = () => vscode.workspace.getConfiguration('aidlc');

/** Returned from activate() so other extensions and integration tests can drive runs. */
export type AidlcApi = { manager: RunManager; openRun: (runId: string) => void };

export function activate(ctx: vscode.ExtensionContext): AidlcApi | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    // Every command needs a workspace to run in; register stubs that say so.
    for (const cmd of ['aidlc.startWorkflow', 'aidlc.resumeRun', 'aidlc.stopRun', 'aidlc.openArtifacts', 'aidlc.refreshArtifacts']) {
      ctx.subscriptions.push(vscode.commands.registerCommand(cmd, () => vscode.window.showWarningMessage('AIDLC: open a folder first.')));
    }
    ctx.subscriptions.push(vscode.commands.registerCommand('aidlc.setApiKey', () => setApiKey(ctx)));
    return;
  }
  const cwd = folder.uri.fsPath;
  const log = vscode.window.createOutputChannel('AIDLC');

  // CodeGraph ships with the extension and is used by every stage.
  const codegraph = new CodeGraph(cwd, resolveBundledCodeGraph(), () => agentEnv(ctx), (message) => {
    log.appendLine(`[codegraph] ${message}`);
    void vscode.window.showWarningMessage(`AIDLC: ${message}`, 'Show log').then((pick) => pick && log.show());
  });

  const backend = new SdkBackend({
    get model() {
      return config().get<string>('model', 'claude-opus-5-5');
    },
    get maxTurns() {
      return config().get<number>('maxTurnsPerStage', 40);
    },
    get maxBudgetUsd() {
      return config().get<number>('maxBudgetUsdPerStage', 5);
    },
    env: () => agentEnv(ctx),
    codegraph: () => codegraph,
    log: (line) => log.append(line),
  });

  const docsFolder = () => config().get<string>('docsFolder', 'aidlc-docs');
  const manager = new RunManager(ctx.extensionPath, cwd, backend, () => ({
    docsFolder: docsFolder(),
    autoApprove: config().get<boolean>('autoApprove', false),
  }));
  const openRun = (runId: string) => RunPanel.show(ctx.extensionUri, manager, cwd, runId);

  const sidebar = new SidebarProvider(ctx.extensionUri, manager, () => hasAuth(ctx), openRun);
  ctx.subscriptions.push(new AttentionTracker(manager, openRun));
  const artifacts = new ArtifactTreeProvider(cwd, docsFolder);

  const docsWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/*.md'));
  const wfWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '.aidlc/workflows/*.{yml,yaml}'));
  const reloadWorkflows = () => {
    try {
      manager.reloadWorkflows();
    } catch (err) {
      void vscode.window.showErrorMessage(`AIDLC: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  ctx.subscriptions.push(
    log,
    manager,
    docsWatcher,
    wfWatcher,
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar),
    vscode.window.registerTreeDataProvider('aidlc.artifacts', artifacts),
    docsWatcher.onDidCreate(() => artifacts.refresh()),
    docsWatcher.onDidDelete(() => artifacts.refresh()),
    wfWatcher.onDidChange(reloadWorkflows),
    wfWatcher.onDidCreate(reloadWorkflows),
    wfWatcher.onDidDelete(reloadWorkflows),
    ctx.secrets.onDidChange(() => void sidebar.post()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aidlc')) {
        artifacts.refresh();
        void sidebar.post();
      }
    }),

    vscode.commands.registerCommand('aidlc.startWorkflow', async () => {
      const pick = await vscode.window.showQuickPick(
        manager.listWorkflows().map((w) => ({ label: w.name, detail: w.description, id: w.id })),
        { placeHolder: 'Choose an AIDLC workflow' },
      );
      if (!pick) return;
      const wf = manager.workflow(pick.id)!;
      const inputs: Record<string, string> = {};
      for (const input of wf.inputs) {
        const value =
          input.type === 'choice'
            ? await vscode.window.showQuickPick(input.options ?? [], { placeHolder: input.label })
            : await vscode.window.showInputBox({ prompt: input.label, value: input.default });
        if (value === undefined) return;
        inputs[input.id] = value;
      }
      openRun(await manager.start(wf.id, inputs));
    }),

    vscode.commands.registerCommand('aidlc.resumeRun', async () => {
      const runs = manager.listRuns().filter((r) => ['paused', 'stopped', 'failed', 'awaiting_approval', 'awaiting_input'].includes(r.status));
      if (!runs.length) return vscode.window.showInformationMessage('AIDLC: no runs to resume.');
      const pick = await vscode.window.showQuickPick(
        runs.map((r) => ({ label: r.workflowName, description: r.status, detail: r.label, id: r.id })),
        { placeHolder: 'Resume which run?' },
      );
      if (!pick) return;
      openRun(pick.id);
      void manager.runner(pick.id)?.resume();
    }),

    vscode.commands.registerCommand('aidlc.stopRun', async () => {
      const runId =
        RunPanel.activeRunId() ??
        (
          await vscode.window.showQuickPick(
            manager.listRuns().filter((r) => r.status === 'running' || r.status === 'awaiting_input').map((r) => ({ label: r.workflowName, detail: r.label, id: r.id })),
            { placeHolder: 'Stop which run?' },
          )
        )?.id;
      if (runId) manager.runner(runId)?.stop();
    }),

    vscode.commands.registerCommand('aidlc.setApiKey', () => setApiKey(ctx)),

    vscode.commands.registerCommand('aidlc.openArtifacts', () =>
      vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(path.join(cwd, docsFolder()))),
    ),
    vscode.commands.registerCommand('aidlc.refreshArtifacts', () => artifacts.refresh()),
  );
  return { manager, openRun };
}

export function deactivate(): void {}

async function setApiKey(ctx: vscode.ExtensionContext): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: 'Anthropic API key (stored in VS Code secret storage). Leave empty to remove.',
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return;
  if (key.trim()) await ctx.secrets.store(API_KEY_SECRET, key.trim());
  else await ctx.secrets.delete(API_KEY_SECRET);
}

async function hasAuth(ctx: vscode.ExtensionContext): Promise<boolean> {
  return config().get('provider') !== 'anthropic' || !!process.env.ANTHROPIC_API_KEY || !!(await ctx.secrets.get(API_KEY_SECRET));
}

/** Environment for the Claude Code process: inherited env plus auth/provider settings. */
async function agentEnv(ctx: vscode.ExtensionContext): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  const key = await ctx.secrets.get(API_KEY_SECRET);
  if (key) env.ANTHROPIC_API_KEY = key;
  const provider = config().get<string>('provider', 'anthropic');
  if (provider === 'bedrock') env.CLAUDE_CODE_USE_BEDROCK = '1';
  if (provider === 'vertex') env.CLAUDE_CODE_USE_VERTEX = '1';
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'aidlc-vscode/0.1.0';
  return env;
}
