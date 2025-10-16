import * as vscode from 'vscode';
import { runInsightsQuery, listLogGroups, listQueryDefinitions, putQueryDefinition, deleteQueryDefinition } from './cloudwatch';

interface SavedQuery { id: string; name: string; logGroups: string[]; query: string; }
interface FavoriteLogGroup { name: string; region: string; }

// Messages from webview -> extension
type WebviewInMessage =
  | { type: 'runQuery'; data: { logGroups: string[]; region?: string; query: string; startTime: number; endTime: number } }
  | { type: 'getSavedQueries'; region?: string }
  | { type: 'saveQuery'; data: { id: string; name: string; query: string; logGroups: string[] }; region?: string }
  | { type: 'deleteQuery'; id: string; region?: string }
  | { type: 'listLogGroups'; region?: string; prefix?: string }
  | { type: 'getFavorites' }
  | { type: 'addFavorite'; data: FavoriteLogGroup }
  | { type: 'removeFavorite'; name: string; region: string }
  | { type: 'runFromCommand' }
  | { type: 'saveFromCommand' };

// Outgoing messages (subset typed for clarity)
type WebviewOutMessage =
  | { type: 'savedQueries'; data: SavedQuery[]; source: 'aws' | 'local'; error?: string; savedId?: string }
  | { type: 'logGroupsList'; data: string[] }
  | { type: 'logGroupsListError'; error: string }
  | { type: 'favorites'; data: FavoriteLogGroup[] }
  | { type: 'queryStatus'; data: { status: string } }
  | { type: 'queryResult'; data: any }
  | { type: 'queryError'; error: string };

const SAVED_KEY = 'cloudwatchLogsViewer.savedQueries';
const FAVORITES_KEY = 'cloudwatchLogsViewer.favoriteLogGroups';

export function activate(context: vscode.ExtensionContext) {
  const openCmd = vscode.commands.registerCommand('cloudwatchLogsViewer.open', () => openPanel(context));
  const runCmd = vscode.commands.registerCommand('cloudwatchLogsViewer.runQuery', () => {
    ensurePanel(context);
    panel?.webview.postMessage({ type: 'runFromCommand' });
  });
  const saveCmd = vscode.commands.registerCommand('cloudwatchLogsViewer.saveQuery', async () => {
    ensurePanel(context);
    panel?.webview.postMessage({ type: 'saveFromCommand' });
  });
  context.subscriptions.push(openCmd, runCmd, saveCmd);
}

export function deactivate() { }

let panel: vscode.WebviewPanel | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let currentQueryAbortController: AbortController | undefined;

function ensurePanel(context: vscode.ExtensionContext) {
  if (!panel) {
    openPanel(context);
  }
}

function openPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal();
    return;
  }
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('CloudWatch Logs Queries');
  }
  panel = vscode.window.createWebviewPanel('cloudwatchLogsViewer', 'CloudWatch Logs Viewer', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.onDidDispose(() => { panel = undefined; });
  panel.webview.html = getHtml(panel.webview, context.extensionUri);
  panel.webview.onDidReceiveMessage(async (msg: WebviewInMessage) => {
    switch (msg.type) {
      case 'runQuery':
        await handleRunQuery(msg.data, context);
        break;
      case 'getSavedQueries': {
        // Legacy local queries request -> treat as AWS-backed first, fallback to local
        const config = vscode.workspace.getConfiguration();
        const region = (msg as any).region || config.get('cloudwatchLogsViewer.defaultRegion');
        try {
          const mapped = await mapAwsQueryDefinitions(region as string);
          post({ type: 'savedQueries', data: mapped, source: 'aws' });
        } catch (e: any) {
          post({ type: 'savedQueries', data: getSaved(context), source: 'local', error: e.message || String(e) });
        }
        break; }
      case 'saveQuery': {
        const config = vscode.workspace.getConfiguration();
        const region = (msg as any).region || config.get('cloudwatchLogsViewer.defaultRegion');
        try {
          const id = await putQueryDefinition(region as string, { id: msg.data.id, name: msg.data.name, queryString: msg.data.query, logGroupNames: msg.data.logGroups });
          const mapped = await mapAwsQueryDefinitions(region as string);
          post({ type: 'savedQueries', data: mapped, source: 'aws', savedId: id });
        } catch (e: any) {
          // fallback to local save
            saveQuery(context, msg.data);
            post({ type: 'savedQueries', data: getSaved(context), source: 'local', error: e.message || String(e) });
        }
        break; }
      case 'deleteQuery': {
        const config = vscode.workspace.getConfiguration();
        const region = (msg as any).region || config.get('cloudwatchLogsViewer.defaultRegion');
        try {
          await deleteQueryDefinition(region as string, msg.id);
          const mapped = await mapAwsQueryDefinitions(region as string);
          post({ type: 'savedQueries', data: mapped, source: 'aws' });
        } catch (e: any) {
          deleteQuery(context, msg.id);
          post({ type: 'savedQueries', data: getSaved(context), source: 'local', error: e.message || String(e) });
        }
        break; }
      case 'listLogGroups':
        {
          const config = vscode.workspace.getConfiguration();
          const region = msg.region || config.get('cloudwatchLogsViewer.defaultRegion');
          try {
            const groups = await listLogGroups(region as string, msg.prefix || undefined);
            post({ type: 'logGroupsList', data: groups });
          } catch (err: any) {
            post({ type: 'logGroupsListError', error: err.message || String(err) });
          }
        }
        break;
      case 'getFavorites':
        post({ type: 'favorites', data: getFavorites(context) });
        break;
      case 'addFavorite':
        addFavorite(context, msg.data);
        post({ type: 'favorites', data: getFavorites(context) });
        break;
      case 'removeFavorite':
        removeFavorite(context, msg.name, msg.region);
        post({ type: 'favorites', data: getFavorites(context) });
        break;
    }
  });
}

function getSaved(context: vscode.ExtensionContext): SavedQuery[] {
  return context.globalState.get<SavedQuery[]>(SAVED_KEY, []);
}

function saveQuery(context: vscode.ExtensionContext, q: SavedQuery) {
  const list = getSaved(context);
  const existing = list.findIndex(x => x.id === q.id);
  if (existing >= 0) list[existing] = q; else list.push(q);
  context.globalState.update(SAVED_KEY, list);
}

function deleteQuery(context: vscode.ExtensionContext, id: string) {
  context.globalState.update(SAVED_KEY, getSaved(context).filter(x => x.id !== id));
}

function getFavorites(context: vscode.ExtensionContext): FavoriteLogGroup[] {
  return context.globalState.get<FavoriteLogGroup[]>(FAVORITES_KEY, []);
}

function addFavorite(context: vscode.ExtensionContext, fav: FavoriteLogGroup) {
  const list = getFavorites(context);
  const existing = list.findIndex(x => x.name === fav.name && x.region === fav.region);
  if (existing < 0) {
    list.push(fav);
    context.globalState.update(FAVORITES_KEY, list);
  }
}

function removeFavorite(context: vscode.ExtensionContext, name: string, region: string) {
  context.globalState.update(FAVORITES_KEY, getFavorites(context).filter(x => !(x.name === name && x.region === region)));
}

async function handleRunQuery(data: { logGroups: string[]; region?: string; query: string; startTime: number; endTime: number }, context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration();
  const region = data.region || config.get('cloudwatchLogsViewer.defaultRegion') as string;
  const pollIntervalMs = config.get('cloudwatchLogsViewer.queryPollIntervalMs') as number;
  const timeoutMs = config.get('cloudwatchLogsViewer.queryTimeoutMs') as number;
  const startTime = Math.floor(data.startTime / 1000);
  const endTime = Math.floor(data.endTime / 1000);
  if (!data.logGroups?.length) {
    post({ type: 'queryError', error: 'No log groups specified' });
    return;
  }
  if (!data.query?.trim()) {
    post({ type: 'queryError', error: 'Query string is empty' });
    return;
  }
  try {
    // Abort any in-flight query to avoid overlapping polling loops
    if (currentQueryAbortController) {
      currentQueryAbortController.abort();
    }
    currentQueryAbortController = new AbortController();
    if (outputChannel) {
      const ts = new Date().toISOString();
      const startDate = new Date(data.startTime).toISOString();
      const endDate = new Date(data.endTime).toISOString();
      outputChannel.appendLine(`[${ts}] Region: ${region}`);
      outputChannel.appendLine(`Time Range (UTC): ${startDate} to ${endDate}`);
      outputChannel.appendLine(`LogGroups: ${data.logGroups.join(', ')}`);
      outputChannel.appendLine('Query:');
      outputChannel.appendLine(data.query);
      outputChannel.appendLine('---');
      // Don't show/focus the output channel automatically
    }
    post({ type: 'queryStatus', data: { status: 'Running' } });
    const result = await runInsightsQuery({
      logGroupNames: data.logGroups,
      queryString: data.query,
      startTime,
      endTime,
      region,
      pollIntervalMs,
      timeoutMs,
    }, currentQueryAbortController.signal);
    post({ type: 'queryResult', data: result });
  } catch (err: any) {
    if (err?.name === 'AbortError' || /aborted/i.test(err?.message)) {
      post({ type: 'queryStatus', data: { status: 'Aborted' } });
    } else {
      post({ type: 'queryError', error: err.message || String(err) });
    }
  }
}

async function mapAwsQueryDefinitions(region: string): Promise<SavedQuery[]> {
  const defs = await listQueryDefinitions(region);
  return defs.map(d => ({ id: d.id, name: d.name, query: d.queryString, logGroups: d.logGroupNames || [] }));
}

function post(message: WebviewOutMessage) {
  panel?.webview.postMessage(message);
}

function getHtml(webview: vscode.Webview, extUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'media', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'media', 'webview.css'));
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>CloudWatch Logs Viewer</title>
</head>
<body>
  <div class="app-container">
    <!-- Main area: Favorites + Log Groups + Query + Results -->
    <main class="main-area">
      <!-- Log Groups Section (includes favorites) -->
      <section class="log-groups-panel">
        <div class="section-header-static">
          <h2>Log Groups <span class="count" id="lgSelectedCount">0 selected</span></h2>
        </div>
        
        <!-- Favorites (always visible) -->
        <div class="favorites-section-inline">
          <h3>★ Favorites <span class="count" id="favCount">0</span></h3>
          <div class="favorites-row">
            <div id="favList" class="fav-list-horizontal"></div>
            <button id="otherGroupsBtn" class="toggle-other-groups-btn">▶ Other Groups</button>
          </div>
        </div>
        
        <!-- Other Groups (collapsible) -->
        <div class="section-content collapsed" id="lgSectionContent">
          <div class="lg-header-controls">
            <label class="inline-label">Region: <input id="region" placeholder="us-east-2" size="12" /></label>
            <input id="lgFilter" placeholder="Filter prefix..." size="20" title="Enter prefix to filter log groups" />
            <button id="lgRefreshBtn" title="Refresh log groups list">⟳ Refresh</button>
          </div>
          <div id="lgList" class="lg-list-horizontal"></div>
        </div>
      </section>

      <section class="query-panel">
        <div class="query-editor-row">
          <div class="query-editor-wrapper">
            <div class="query-header-row">
              <h2>Query Editor</h2>
              <div class="saved-query-selector">
                <select id="savedSelect">
                  <option value="">Load saved query...</option>
                </select>
              </div>
            </div>
            <div class="code-editor-container">
              <div id="queryHighlight" class="code-editor-highlight"></div>
              <textarea id="query" class="code-editor" spellcheck="false" placeholder="Enter your CloudWatch Logs Insights query here...">fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100</textarea>
            </div>
          </div>
          <div class="query-controls-sidebar">
            <h2>Time Range</h2>
            <div class="time-range-controls">
              <div class="time-mode-toggle">
                  <button class="mode-btn active" data-mode="relative">Relative</button>
                  <button class="mode-btn" data-mode="absolute">Absolute</button>
                </div>
                <div class="time-inputs-container">
              <label class="inline-label relative-time">
                <select id="timeRange"></select>
              </label>
              <div class="absolute-time datetime-group">
                <div class="datetime-field">
                  <label class="field-label">Start</label>
                  <div class="datetime-inputs">
                    <input type="date" id="startDate" class="date-input" />
                    <input type="time" id="startTime" class="time-input" step="1" />
                    <button class="icon-btn" id="startNowBtn" title="Set to now">Now</button>
                  </div>
                </div>
                <button class="icon-btn copy-btn" id="copyStartToEnd" title="Copy start to end">↓</button>
                <div class="datetime-field">
                  <label class="field-label">End</label>
                  <div class="datetime-inputs">
                    <input type="date" id="endDate" class="date-input" />
                    <input type="time" id="endTime" class="time-input" step="1" />
                    <button class="icon-btn" id="endNowBtn" title="Set to now">Now</button>
                  </div>
                </div>
                <span class="time-zone-label">(UTC)</span>
              </div>
              </div>
            </div>
            <button id="runBtn" class="primary-btn">▶ Run Query</button>
          </div>
        </div>
      </section>

      <section class="results-panel">
        <div class="results-header">
          <h2>Results <span id="resultCount"></span></h2>
          <div class="search-controls">
            <label class="search-toggle">
              <input type="checkbox" id="searchHideNonMatching" checked />
              <span>Hide non-matching</span>
            </label>
            <input id="searchInput" placeholder="Search in results (Ctrl+F)..." />
            <button id="searchPrevBtn" title="Previous match">▲</button>
            <button id="searchNextBtn" title="Next match">▼</button>
            <button id="searchClearBtn" title="Clear search">✕</button>
          </div>
        </div>
  <div id="status" class="status"></div>
        <div id="results" class="results"></div>
      </section>
    </main>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}