import { homedir } from 'node:os';
import * as vscode from 'vscode';
import type { HostApi, HostEvent, HostMessage, HostMethod, SerializedError, WebviewMessage } from '../shared/messages';
import type { AppSettings } from '../shared/types';
import { cancelQuery, listLogGroups, listProfiles, logGroupFields, runQuery, setLog } from './aws';
import { output } from './output';
import { loadRawFields, loadState, migrateLegacyState, saveRawFields, saveState } from './storage';

export const VIEW_TYPE = 'cloudwatchLogsViewer';
const CONFIG = 'cloudwatchLogsViewer';

export function readSettings(): AppSettings {
  const config = vscode.workspace.getConfiguration(CONFIG);
  const costPerGb = config.get<number>('costPerGb');
  return {
    profile: config.get<string>('awsProfile')?.trim() ?? '',
    defaultRegion: config.get<string>('defaultRegion')?.trim() || 'us-east-2',
    costPerGb: typeof costPerGb === 'number' && costPerGb >= 0 ? costPerGb : 0.005,
  };
}

type Handlers = { [M in HostMethod]: (params: Parameters<HostApi[M]>[0]) => Promise<ReturnType<HostApi[M]>> };

/** The viewer: one webview panel, which asks the host for AWS calls, storage and the clipboard. */
export class ViewerPanel {
  private static current: ViewerPanel | undefined;

  /** Shows the viewer, creating it if needed; `shared` opens a share link's query in a tab. */
  static show(context: vscode.ExtensionContext, shared?: string) {
    if (ViewerPanel.current) {
      ViewerPanel.current.panel.reveal();
      if (shared) {
        ViewerPanel.current.openShared(shared);
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'CloudWatch Logs', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
    });
    ViewerPanel.current = new ViewerPanel(context, panel, shared);
  }

  /** Brings back a panel VS Code kept open across a restart. */
  static restore(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
    ViewerPanel.current?.panel.dispose();
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
    };
    ViewerPanel.current = new ViewerPanel(context, panel);
  }

  private readonly disposables: vscode.Disposable[] = [];
  /** A share link that arrived before the webview asked for its initial data. */
  private pendingShared: string | undefined;
  private ready = false;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    shared?: string
  ) {
    setLog(output());
    this.pendingShared = shared;
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    panel.webview.html = this.html();
    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((msg: WebviewMessage) => this.onMessage(msg)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG)) {
          this.post({ kind: 'event', event: { type: 'settings', settings: readSettings() } });
        }
      })
    );
  }

  private openShared(params: string) {
    if (this.ready) {
      this.postEvent({ type: 'openShared', params });
    } else {
      this.pendingShared = params;
    }
  }

  private dispose() {
    if (ViewerPanel.current === this) {
      ViewerPanel.current = undefined;
    }
    this.disposables.forEach((d) => d.dispose());
  }

  private post(message: HostMessage) {
    void this.panel.webview.postMessage(message);
  }

  private postEvent(event: HostEvent) {
    this.post({ kind: 'event', event });
  }

  private async onMessage(msg: WebviewMessage) {
    if (msg?.kind !== 'request') {
      return;
    }
    const handler = this.handlers[msg.method] as ((params: unknown) => Promise<unknown>) | undefined;
    try {
      if (!handler) {
        throw new Error(`Unknown request ${msg.method}`);
      }
      const result = await handler(msg.params);
      this.post({ kind: 'response', id: msg.id, result });
    } catch (err) {
      this.post({ kind: 'response', id: msg.id, error: serializeError(err) });
    }
  }

  private readonly handlers: Handlers = {
    init: async () => {
      const settings = readSettings();
      let state = loadState(this.context);
      if (!state) {
        state = await migrateLegacyState(this.context, settings.profile || undefined, settings.defaultRegion);
        if (state) {
          await saveState(this.context, state);
        }
      }
      const shared = this.pendingShared;
      this.pendingShared = undefined;
      this.ready = true;
      return {
        state,
        rawFields: loadRawFields(this.context),
        settings,
        linkBase: `${vscode.env.uriScheme}://${this.context.extension.id}/open?q=`,
        shared,
      };
    },
    saveState: async ({ state }) => {
      await saveState(this.context, state);
    },
    saveRawFields: async ({ history }) => {
      await saveRawFields(this.context, history);
    },
    listProfiles: async () => listProfiles(),
    listLogGroups: ({ profile, region, prefix }) => listLogGroups(profile || undefined, region, prefix),
    logGroupFields: ({ profile, group }) => logGroupFields(profile || undefined, group),
    runQuery: (params) => {
      const timeout = vscode.workspace.getConfiguration(CONFIG).get<number>('queryTimeoutMs') ?? 1800000;
      return runQuery({ ...params, profile: params.profile || undefined }, Math.max(1000, timeout));
    },
    cancelQuery: async ({ requestId }) => cancelQuery(requestId),
    copy: async ({ text }) => {
      await vscode.env.clipboard.writeText(text);
    },
    saveFile: async ({ filename, content }) => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(homedir());
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(folder, filename),
        filters: { CSV: ['csv'] },
        saveLabel: 'Export',
      });
      if (!uri) {
        return false;
      }
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
      void vscode.window.showInformationMessage(`Exported ${uri.fsPath}`, 'Open').then((choice) => {
        if (choice === 'Open') {
          void vscode.commands.executeCommand('vscode.open', uri);
        }
      });
      return true;
    },
    openSettings: async ({ query }) => {
      await vscode.commands.executeCommand('workbench.action.openSettings', query);
    },
  };

  private html(): string {
    const webview = this.panel.webview;
    const base = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(base, 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(base, 'webview.css'));
    const worker = webview.asWebviewUri(vscode.Uri.joinPath(base, 'editor.worker.js'));
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`,
      // Monaco's editor worker is fetched and started from a blob.
      `connect-src ${webview.cspSource}`,
      'worker-src blob:',
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${style}" />
  <title>CloudWatch Logs</title>
</head>
<body>
  <div id="root" data-worker="${worker}"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}

function serializeError(err: unknown): SerializedError {
  const e = err as { name?: string; message?: string; cancelled?: boolean };
  if (e?.cancelled) {
    return { message: 'Query cancelled', cancelled: true };
  }
  let message = typeof e?.message === 'string' && e.message ? e.message : String(err);
  if (e?.name === 'CredentialsProviderError' && /any providers/i.test(message)) {
    message +=
      '. Configure AWS credentials (aws configure, or aws sso login --profile <name>) or pick a profile in the top bar.';
  }
  return { message, name: e?.name };
}
