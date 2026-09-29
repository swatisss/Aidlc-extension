import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** Tree of files under the AIDLC docs folder. */
export class ArtifactTreeProvider implements vscode.TreeDataProvider<string> {
  private readonly emitter = new vscode.EventEmitter<string | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly cwd: string,
    private readonly docsFolder: () => string,
  ) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(abs: string): vscode.TreeItem {
    const isDir = fs.statSync(abs).isDirectory();
    const item = new vscode.TreeItem(
      path.basename(abs),
      isDir ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    item.resourceUri = vscode.Uri.file(abs);
    if (!isDir) {
      item.command = {
        command: abs.endsWith('.md') ? 'markdown.showPreview' : 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(abs)],
      };
    }
    return item;
  }

  getChildren(abs?: string): string[] {
    const dir = abs ?? path.join(this.cwd, this.docsFolder());
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map((d) => path.join(dir, d.name));
  }
}
