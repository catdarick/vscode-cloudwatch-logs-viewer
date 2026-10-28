import * as vscode from 'vscode';
import { disposeOutput } from './output';
import { VIEW_TYPE, ViewerPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    { dispose: disposeOutput },
    vscode.commands.registerCommand('cloudwatchLogsViewer.open', () => ViewerPanel.show(context)),
    // Share links: <scheme>://catdarick.cloudwatch-logs-viewer/open?q=<base64url search params>.
    // The params are base64url so nothing between the copy and VS Code can re-encode them.
    vscode.window.registerUriHandler({
      handleUri(uri) {
        const q = new URLSearchParams(uri.query).get('q');
        let params: string | undefined;
        try {
          params = q ? Buffer.from(q, 'base64url').toString('utf8') : undefined;
        } catch {
          params = undefined;
        }
        if (!params || !new URLSearchParams(params).has('query')) {
          void vscode.window.showErrorMessage('This CloudWatch Logs link is incomplete or damaged.');
          ViewerPanel.show(context);
          return;
        }
        ViewerPanel.show(context, params);
      },
    }),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(panel) {
        ViewerPanel.restore(context, panel);
      },
    })
  );
}

export function deactivate() {}
