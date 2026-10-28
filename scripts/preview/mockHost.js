// A fake extension host for scripts/preview: canned log groups and generated query results.
(() => {
  const light = new URLSearchParams(location.search).get('theme') === 'light';
  const dark = {
    foreground: '#cccccc',
    'editor-background': '#1e1e1e',
    'editor-foreground': '#d4d4d4',
    descriptionForeground: '#ccccccb3',
    disabledForeground: '#cccccc80',
    'textLink-foreground': '#3794ff',
    'button-background': '#0e639c',
    'button-foreground': '#ffffff',
    'button-hoverBackground': '#1177bb',
    'button-secondaryBackground': '#3a3d41',
    'button-secondaryForeground': '#ffffff',
    'button-secondaryHoverBackground': '#45494e',
    focusBorder: '#007fd4',
    'editorError-foreground': '#f14c4c',
    errorForeground: '#f48771',
    'editorWarning-foreground': '#cca700',
    'list-hoverBackground': '#2a2d2e',
    'list-inactiveSelectionBackground': '#37373d',
    'input-background': '#3c3c3c',
    'input-foreground': '#cccccc',
    'input-placeholderForeground': '#a6a6a6',
    'editorWidget-background': '#252526',
    'editorWidget-foreground': '#cccccc',
    'editorWidget-border': '#454545',
    'widget-shadow': '#0000005c',
    'menu-background': '#252526',
    'menu-foreground': '#cccccc',
    'menu-selectionBackground': '#04395e',
    'menu-selectionForeground': '#ffffff',
    'debugTokenExpression-string': '#ce9178',
    'debugTokenExpression-number': '#b5cea8',
    'debugTokenExpression-boolean': '#4e94ce',
    'editor-selectionBackground': '#264f78',
    'editorLineNumber-foreground': '#858585',
    'editorSuggestWidget-background': '#252526',
    'editorHoverWidget-background': '#252526',
    'testing-iconPassed': '#73c991',
  };
  const lightColors = {
    ...dark,
    foreground: '#616161',
    'editor-background': '#ffffff',
    'editor-foreground': '#000000',
    descriptionForeground: '#717171',
    disabledForeground: '#61616180',
    'textLink-foreground': '#006ab1',
    'button-background': '#007acc',
    'button-hoverBackground': '#0062a3',
    'button-secondaryBackground': '#5f6a79',
    'button-secondaryHoverBackground': '#4c5561',
    focusBorder: '#0090f1',
    'editorError-foreground': '#e51400',
    errorForeground: '#a1260d',
    'editorWarning-foreground': '#bf8803',
    'list-hoverBackground': '#e8e8e8',
    'list-inactiveSelectionBackground': '#e4e6f1',
    'input-background': '#ffffff',
    'input-foreground': '#616161',
    'input-placeholderForeground': '#767676',
    'input-border': '#cecece',
    'editorWidget-background': '#f3f3f3',
    'editorWidget-foreground': '#616161',
    'editorWidget-border': '#c8c8c8',
    'widget-shadow': '#00000029',
    'menu-background': '#ffffff',
    'menu-foreground': '#616161',
    'menu-selectionBackground': '#0060c0',
    'debugTokenExpression-string': '#a31515',
    'debugTokenExpression-number': '#098658',
    'debugTokenExpression-boolean': '#0000ff',
    'editor-selectionBackground': '#add6ff',
    'editorLineNumber-foreground': '#237893',
    'editorSuggestWidget-background': '#f3f3f3',
    'editorHoverWidget-background': '#f3f3f3',
  };
  const colors = light ? lightColors : dark;
  const vars = Object.entries(colors).map(([k, v]) => `--vscode-${k}: ${v};`);
  vars.push("--vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;");
  vars.push("--vscode-editor-font-family: Menlo, Monaco, 'Courier New', monospace;");
  document.getElementById('theme').textContent = `html { ${vars.join(' ')} }`;
  document.addEventListener('DOMContentLoaded', () => document.body.classList.add(light ? 'vscode-light' : 'vscode-dark'));
  document.body?.classList.add(light ? 'vscode-light' : 'vscode-dark');

  const groups = [
    '/aws/lambda/checkout',
    '/aws/lambda/payments',
    '/ecs/web',
    '/ecs/worker',
    '/k8s/api-gateway',
    '/k8s/orders',
    'billing-service',
  ];
  const pods = ['orders-7c9f-x2k', 'orders-7c9f-p8d', 'api-gw-55b-q1z'];
  const levels = ['info', 'info', 'info', 'info', 'debug', 'warn', 'error'];
  const paths = ['/api/orders', '/api/orders/42', '/health', '/api/users/me', '/api/cart'];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const cwTime = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');

  function event(ms, i) {
    const level = pick(levels);
    const json = {
      level,
      msg: level === 'error' ? 'request failed: upstream timeout' : level === 'warn' ? 'slow query' : 'request handled',
      path: pick(paths),
      status: level === 'error' ? 502 : 200,
      duration_ms: Math.round(rand() * 900),
      'request-id': `req-${(100000 + i).toString(16)}`,
      kubernetes: { pod_name: pick(pods), namespace: 'prod', labels: { app: 'orders' } },
      user: rand() > 0.5 ? { id: Math.floor(rand() * 1000), plan: pick(['free', 'pro']) } : null,
    };
    return { ms, json, message: JSON.stringify(json) };
  }

  function fieldsOf(query) {
    // Without the prefix the extension puts in front of the query.
    const m = /(?:^|\|)\s*fields\s+([^|]+)/i.exec(query.replace(/^fields @timestamp, [^|]*__logstream__internal__ \| /, ''));
    if (!m) return ['@timestamp', '@message'];
    return m[1].split(',').map((f) => f.trim().split(/\s+as\s+/i).pop().replace(/`/g, '')).filter(Boolean);
  }

  function valueOf(e, field) {
    if (field === '@timestamp') return cwTime(e.ms);
    if (field === '@message') return e.message;
    let v = e.json;
    for (const part of field.split('.')) v = v == null ? undefined : v[part];
    return v === undefined || v === null ? undefined : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }

  async function runQuery({ query, from, to, regions }) {
    await new Promise((r) => setTimeout(r, 700));
    if (/\|\s*estimate\s*$/.test(query)) {
      // About 40 MB per hour of range and log group, like a busy service.
      const bytes = Math.round(((to - from) / 3600000) * 42_000_000 * regions[0].logGroupNames.length);
      return [{ region: regions[0].region, rows: [[{ field: '@estimatedBytesScanned', value: String(bytes) }]], statistics: { bytesScanned: 0 } }];
    }
    if (/\bfilterr\b|\|\s*$/.test(query)) {
      throw { message: 'unexpected symbol found | at line 1 and position 180', name: 'MalformedQueryException' };
    }
    const limit = Number((/limit\s+(\d+)/i.exec(query) || [])[1] || 1000);
    const matched = 1800;
    const events = Array.from({ length: matched }, (_, i) => event(from + rand() * (to - from), i)).sort((a, b) => b.ms - a.ms);
    const rows = [];
    if (/\bstats\b/i.test(query)) {
      const bin = 5 * 60 * 1000;
      const counts = new Map();
      events.forEach((e) => counts.set(Math.floor(e.ms / bin) * bin, (counts.get(Math.floor(e.ms / bin) * bin) || 0) + 1));
      for (const [t, n] of [...counts].sort((a, b) => a[0] - b[0])) {
        rows.push([{ field: 'bin(5m)', value: cwTime(t) }, { field: 'count()', value: String(n) }]);
      }
      return regions.map((r, i) => ({ region: r.region, rows: i === 0 ? rows : [], statistics: { bytesScanned: 52428800, recordsScanned: 48000, recordsMatched: matched } }));
    }
    const fields = fieldsOf(query);
    for (const e of events.slice(0, limit)) {
      const row = [
        { field: '@timestamp', value: cwTime(e.ms) },
        { field: '__message__internal__', value: e.message },
        { field: '__log__internal__', value: `123456789012:${regions[0].logGroupNames[0]}` },
        { field: '__logstream__internal__', value: `${e.json.kubernetes.pod_name}/stdout` },
      ];
      for (const f of fields) {
        const v = valueOf(e, f);
        if (v !== undefined && f !== '@timestamp') row.push({ field: f, value: v });
      }
      row.push({ field: '@ptr', value: 'CmAKJgoiMTIzNDU2Nzg5MDEyOi9lY3Mvd2Vi' });
      rows.push(row);
    }
    return [{ region: regions[0].region, rows, statistics: { bytesScanned: 1288490188, recordsScanned: 2412345, recordsMatched: matched } }];
  }

  const handlers = {
    init: async () => ({
      state: undefined,
      rawFields: {},
      settings: { profile: '', defaultRegion: 'us-east-2', costPerGb: 0.005 },
      linkBase: 'vscode://catdarick.cloudwatch-logs-viewer/open?q=',
    }),
    saveState: async () => undefined,
    saveRawFields: async () => undefined,
    listProfiles: async () => ['default', 'prod', 'staging'],
    listLogGroups: async ({ region, prefix }) => {
      await new Promise((r) => setTimeout(r, 300));
      return groups.filter((g) => g.startsWith(prefix || '')).map((name) => ({ name, region, arn: `arn:aws:logs:${region}:123456789012:log-group:${name}:*` }));
    },
    logGroupFields: async () => ['@timestamp', '@message', '@logStream', 'level', 'msg', 'path', 'status', 'kubernetes.pod_name'],
    runQuery,
    cancelQuery: async () => undefined,
    copy: async ({ text }) => console.log('copy', text),
    saveFile: async ({ filename, content }) => (console.log('save', filename, content.length), true),
    openSettings: async ({ query }) => console.log('openSettings', query),
  };

  window.__devHost = {
    events: new EventTarget(),
    request: (method, params) => handlers[method](params),
  };
})();
