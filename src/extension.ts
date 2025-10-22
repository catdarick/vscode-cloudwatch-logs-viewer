import * as vscode from 'vscode';
import { runInsightsQuery, listLogGroups, listQueryDefinitions, putQueryDefinition, deleteQueryDefinition } from './cloudwatch';

interface SavedQuery { id: string; name: string; logGroups: string[]; query: string; }
interface FavoriteLogGroup { name: string; region: string; }

// Messages from webview -> extension
type WebviewInMessage =
  | { type: 'runQuery'; data: { logGroups: string[]; region?: string; query: string; startTime: number; endTime: number } }
  | { type: 'abortQuery' }
  | { type: 'getSavedQueries'; region?: string }
  | { type: 'saveQuery'; data: { id: string; name: string; query: string; logGroups: string[] }; region?: string }
  | { type: 'deleteQuery'; id: string; region?: string }
  | { type: 'listLogGroups'; region?: string; prefix?: string }
  | { type: 'getFavorites' }
  | { type: 'addFavorite'; data: FavoriteLogGroup }
  | { type: 'removeFavorite'; name: string; region: string }
  | { type: 'debugLog'; message: string }
  | { type: 'updateLastQuery'; query: string };

// Outgoing messages (subset typed for clarity)
type WebviewOutMessage =
  | { type: 'savedQueries'; data: SavedQuery[]; source: 'aws' | 'local'; error?: string; savedId?: string }
  | { type: 'logGroupsList'; data: string[] }
  | { type: 'logGroupsListError'; error: string }
  | { type: 'favorites'; data: FavoriteLogGroup[] }
  | { type: 'queryStatus'; data: { status: string } }
  | { type: 'queryResult'; data: any }
  | { type: 'queryPartialResult'; data: any }
  | { type: 'queryError'; error: string }
  | { type: 'lastQuery'; query: string | undefined };

const SAVED_KEY = 'cloudwatchLogsViewer.savedQueries';
const FAVORITES_KEY = 'cloudwatchLogsViewer.favoriteLogGroups';
const LAST_QUERY_KEY = 'cloudwatchLogsViewer.lastQuery';

export function activate(context: vscode.ExtensionContext) {
  const openCmd = vscode.commands.registerCommand('cloudwatchLogsViewer.open', () => openPanel(context));
  const toggleCommentCmd = vscode.commands.registerCommand('cloudwatchLogsViewer.toggleComment', () => {
    ensurePanel(context);
    panel?.webview.postMessage({ type: 'toggleComment' });
  });
  context.subscriptions.push(openCmd, toggleCommentCmd);
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
  panel.onDidDispose(() => {
    panel = undefined;
    vscode.commands.executeCommand('setContext', 'cloudwatchLogsViewerFocus', false);
  });
  panel.onDidChangeViewState(e => {
    vscode.commands.executeCommand('setContext', 'cloudwatchLogsViewerFocus', e.webviewPanel.active);
  });
  panel.webview.html = getHtml(panel.webview, context.extensionUri);
  panel.webview.onDidReceiveMessage(async (msg: WebviewInMessage) => {
    switch (msg.type) {
      case 'runQuery':
        await handleRunQuery(msg.data, context);
        break;
      case 'abortQuery':
        if (currentQueryAbortController) {
          currentQueryAbortController.abort();
        }
        break;
      case 'debugLog': {
        if (!outputChannel) {
          outputChannel = vscode.window.createOutputChannel('CloudWatch Logs Queries');
        }
        const ts = new Date().toISOString();
        outputChannel.appendLine(`[debug ${ts}] ${msg.message}`);
        break; }
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
      case 'updateLastQuery':
        context.globalState.update(LAST_QUERY_KEY, msg.query || '');
        break;
    }
  });
  // Also send previously edited last query (if any)
  const lastQuery = context.globalState.get<string>(LAST_QUERY_KEY, '') || undefined;
  if (lastQuery) {
    panel.webview.postMessage({ type: 'lastQuery', query: lastQuery });
  }
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

async function handleRunQuery(data: { logGroups: string[]; region?: string; query: string; startTime: number; endTime: number }, _context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration();
  const region = data.region || config.get('cloudwatchLogsViewer.defaultRegion') as string;
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
    // Possibly augment query to ensure we retrieve @message for detail expansion use
    const augmentation = ensureMessageField(data.query);
    if (augmentation.modified) {
      outputChannel?.appendLine('[info] @message field auto-injected (hidden from columns).');
    }
    post({ type: 'queryStatus', data: { status: 'Running' } });
    const hiddenFields = augmentation.modified ? ['@ptr', '@message'] : ['@ptr'];
    const result = await runInsightsQuery({
      logGroupNames: data.logGroups,
      queryString: augmentation.query,
      startTime,
      endTime,
      region,
      pollIntervalMs: 300, // Fast polling with lightweight DescribeQueries
      timeoutMs
    }, currentQueryAbortController.signal);
    // Attach hiddenFields metadata if we injected @message so webview can hide column but still show in detail
    post({ type: 'queryResult', data: { ...result, hiddenFields } });
  } catch (err: any) {
    if (err?.name === 'AbortError' || /aborted/i.test(err?.message)) {
      post({ type: 'queryStatus', data: { status: 'Aborted' } });
    } else {
      post({ type: 'queryError', error: err.message || String(err) });
    }
  }
}

// Ensure the query selects @message so we have full text for expanded detail.
// If user already requests @message explicitly we leave it alone.
// Strategy: if a 'fields' clause exists, add @message if missing (prepend to preserve typical ordering with @timestamp first if present).
// If no fields clause, prepend 'fields @message' line.
function ensureMessageField(original: string): { query: string; modified: boolean } {
  if (!original) return { query: original, modified: false };
  if (/@message\b/i.test(original)) {
    return { query: original, modified: false };
  }
  // Look for first fields clause
  const fieldsMatch = /(^|\n)\s*fields\s+([^\n|]+)/i.exec(original);
  if (fieldsMatch) {
    const full = fieldsMatch[0];
    const prefix = fieldsMatch[1];
    const listPart = fieldsMatch[2];
    // Insert @message after @timestamp if present, else at start
    const hasTimestamp = /@timestamp\b/i.test(listPart);
    let newList;
    if (hasTimestamp) {
      // Keep original order but ensure @message follows @timestamp
      const parts = listPart.split(',').map(p => p.trim()).filter(p => p);
      const tsIndex = parts.findIndex(p => /@timestamp\b/i.test(p));
      parts.splice(tsIndex + 1, 0, '@message');
      newList = parts.join(', ');
    } else {
      newList = '@message, ' + listPart.trim();
    }
    const replaced = original.replace(full, `${prefix}fields ${newList}`);
    return { query: replaced, modified: true };
  }
  // No fields clause -> add one at top
  const injected = `fields @message\n${original}`;
  return { query: injected, modified: true };
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
              <div class="relative-time">
                <div class="relative-time-row">
                  <span class="relative-label">Last</span>
                  <div class="relative-value-options">
                    <div class="relative-quick-row">
                      <button type="button" class="relative-quick-btn active" data-value="1">1</button>
                      <button type="button" class="relative-quick-btn" data-value="2">2</button>
                      <button type="button" class="relative-quick-btn" data-value="3">3</button>
                      <button type="button" class="relative-quick-btn" data-value="5">5</button>
                      <button type="button" class="relative-quick-btn" data-value="7">7</button>
                    </div>
                    <div class="relative-quick-row">
                      <button type="button" class="relative-quick-btn" data-value="10">10</button>
                      <button type="button" class="relative-quick-btn" data-value="15">15</button>
                      <button type="button" class="relative-quick-btn" data-value="30">30</button>
                      <button type="button" class="relative-quick-btn" data-value="60">60</button>
                      <button type="button" class="relative-quick-btn" data-value="90">90</button>
                    </div>
                    <div class="relative-custom-row">
                      <input type="number" id="relativeValue" class="relative-custom-input" placeholder="Custom" min="1" />
                    </div>
                  </div>
                  <div class="unit-toggle">
                    <button class="unit-btn active" data-unit="minutes">minutes</button>
                    <button class="unit-btn" data-unit="hours">hours</button>
                    <button class="unit-btn" data-unit="days">days</button>
                  </div>
                </div>
              </div>
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
            <button id="runBtn" class="primary-btn" data-state="idle">
              <span class="run-btn-icon" aria-hidden="true">▶</span>
              <span class="run-btn-spinner" aria-hidden="true"></span>
              <span class="run-btn-label">Run Query</span>
            </button>
          </div>
        </div>
      </section>

      <section class="results-panel">
        <div class="results-header-container">
          <div class="results-title-and-tabs">
            <div class="tab-bar">
              <div class="tab-list" id="tabList"></div>
              <button id="newTabBtn" class="new-tab-btn" title="New tab (Ctrl+T)">+</button>
            </div>
          </div>
        </div>
        <div id="results-container" class="results-container"></div>
        
        <!-- Floating Search Bar -->
        <div id="searchBar" class="search-bar" hidden>
          <div class="search-bar-content">
            <span class="search-icon" aria-hidden="true">🔍</span>
            <input id="searchInput" type="text" placeholder="Find in results..." aria-label="Search in results" />
            <span id="searchSpinner" class="search-spinner" title="Searching" aria-hidden="true"></span>
            <span id="searchMatchCounter" class="search-match-counter"></span>
            <button id="searchPrevBtn" class="search-nav-btn" title="Previous match (Shift+Enter)" aria-label="Previous match">▲</button>
            <button id="searchNextBtn" class="search-nav-btn" title="Next match (Enter)" aria-label="Next match">▼</button>
            <label class="search-toggle">
              <input type="checkbox" id="searchHideNonMatching" />
              <span>Hide non-matching</span>
            </label>
            <button id="searchCloseBtn" class="search-close-btn" title="Close (Esc)" aria-label="Close search">✕</button>
          </div>
        </div>
        
        <div id="status" class="status status-hidden"></div>
      </section>
    </main>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}