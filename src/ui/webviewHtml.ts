import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

/**
 * HTML shell for a webview bundle with a strict CSP. The entry script is nonce'd; its lazily
 * imported chunks (e.g. Mermaid) are allowed from the extension's own origin. Inline styles are
 * allowed because Mermaid's SVGs carry them.
 */
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, bundle: 'sidebar' | 'runPanel', title: string): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', `${bundle}.js`));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>${title}</title>
</head>
<body>
<div id="root"></div>
<script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
