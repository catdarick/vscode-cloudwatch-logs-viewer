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
    '/aws/eks/prod/orders-api',
    '/aws/eks/prod/payments',
    '/aws/eks/prod/inventory',
    '/aws/lambda/checkout-webhook',
    '/aws/lambda/email-sender',
    '/aws/rds/instance/orders-db/postgresql',
    '/ecs/prod/notifications',
  ];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => Math.round(lo + rand() * (hi - lo));
  const hex = (n) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');

  const cwTime = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');

  // What an orders service logs: mostly requests handled, and an incident still going on.
  const messages = {
    info: [
      ['POST', '/v1/orders', 201, 'order created'],
      ['POST', '/v1/checkout', 200, 'payment authorized'],
      ['POST', '/v1/orders/{id}/reserve', 200, 'inventory reserved'],
      ['GET', '/v1/orders/{id}', 200, 'request completed'],
      ['GET', '/v1/cart', 200, 'request completed'],
      ['PATCH', '/v1/orders/{id}', 200, 'order shipped'],
    ],
    debug: [
      ['GET', '/v1/cart', 200, 'cart loaded from redis'],
      ['GET', '/v1/catalog', 200, 'catalog cache hit'],
    ],
    warn: [
      ['GET', '/v1/orders', 200, 'slow query on orders table'],
      ['POST', '/v1/checkout', 200, 'retrying payment capture'],
      ['POST', '/v1/orders', 429, 'rate limit close to threshold'],
    ],
    error: [
      ['POST', '/v1/checkout', 504, 'upstream timeout calling payments'],
      ['POST', '/v1/checkout', 502, 'payment capture failed: connection reset by peer'],
      ['POST', '/v1/orders/{id}/reserve', 500, 'inventory reservation failed: deadlock detected'],
    ],
  };
  const pods = ['orders-api-7d9f8b6c4-x2k9p', 'orders-api-7d9f8b6c4-m4q7z', 'orders-api-7d9f8b6c4-t8w2n'];
  const DURATION = { info: [12, 240], debug: [2, 30], warn: [600, 1900], error: [2000, 5000] };

  function levelAt(incident) {
    const r = rand();
    if (incident) return r < 0.32 ? 'error' : r < 0.5 ? 'warn' : r < 0.55 ? 'debug' : 'info';
    return r < 0.015 ? 'error' : r < 0.06 ? 'warn' : r < 0.16 ? 'debug' : 'info';
  }

  function event(ms, i, incident) {
    const level = levelAt(incident);
    const [method, route, status, msg] = pick(messages[level]);
    const json = {
      level,
      msg,
      http: { method, path: route.replace('{id}', String(between(48000, 49999))), status },
      duration_ms: between(...DURATION[level]),
      trace_id: hex(16),
      'request-id': `req-${(1000000 + i).toString(16)}`,
      kubernetes: { namespace: 'prod', pod_name: pick(pods), container_name: 'orders-api' },
      user: rand() > 0.3 ? { id: `u_${between(10000, 99999)}`, plan: pick(['free', 'pro', 'enterprise']) } : null,
    };
    return { ms, json, message: JSON.stringify(json) };
  }

  /** Events spread like real traffic: a slow wave over the range and a burst during the incident. */
  function events(from, to, count) {
    const span = to - from;
    const incidentFrom = from + span * 0.9;
    const incidentTo = from + span * 0.995;
    const list = [];
    for (let i = 0; list.length < count; i++) {
      const ms = from + rand() * span;
      const incident = ms >= incidentFrom && ms < incidentTo;
      const density = 0.55 + 0.3 * Math.sin((ms - from) / span * Math.PI * 3) + (incident ? 0.9 : 0);
      if (rand() * 1.8 < density) list.push(event(ms, i, incident));
    }
    return list.sort((a, b) => b.ms - a.ms);
  }

  function fieldsOf(query) {
    // Without the prefix the extension puts in front of the query.
    const m = /(?:^|\|)\s*fields\s+([^|]+)/im.exec(query.replace(/^fields @timestamp, [^|]*__logstream__internal__ \| /, ''));
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

  /** About 200 MB per hour of range and log group, like a busy service. */
  const scanned = (from, to, regions) =>
    Math.round(((to - from) / 3600000) * 210_000_000 * regions.reduce((n, r) => n + r.logGroupNames.length, 0));

  async function runQuery({ query, from, to, regions }) {
    await new Promise((r) => setTimeout(r, 700));
    if (/\|\s*estimate\s*$/.test(query)) {
      const bytes = scanned(from, to, regions);
      return [{ region: regions[0].region, rows: [[{ field: '@estimatedBytesScanned', value: String(bytes) }]], statistics: { bytesScanned: 0 } }];
    }
    if (/\bfilterr\b|\|\s*$/.test(query)) {
      throw { message: 'unexpected symbol found | at line 1 and position 180', name: 'MalformedQueryException' };
    }
    const limit = Number((/limit\s+(\d+)/i.exec(query) || [])[1] || 1000);
    seed = 7;
    const matched = 4213;
    const all = events(from, to, matched);
    const rows = [];
    if (/\bstats\b/i.test(query)) {
      const bin = 5 * 60 * 1000;
      const counts = new Map();
      all.forEach((e) => counts.set(Math.floor(e.ms / bin) * bin, (counts.get(Math.floor(e.ms / bin) * bin) || 0) + 1));
      for (const [t, n] of [...counts].sort((a, b) => a[0] - b[0])) {
        rows.push([{ field: 'bin(5m)', value: cwTime(t) }, { field: 'count()', value: String(n) }]);
      }
      return regions.map((r, i) => ({ region: r.region, rows: i === 0 ? rows : [], statistics: { bytesScanned: 52428800, recordsScanned: 48000, recordsMatched: matched } }));
    }
    const fields = fieldsOf(query);
    for (const e of all.slice(0, limit)) {
      const row = [
        { field: '@timestamp', value: cwTime(e.ms) },
        { field: '__message__internal__', value: e.message },
        { field: '__log__internal__', value: `123456789012:${regions[0].logGroupNames[0]}` },
        { field: '__logstream__internal__', value: `${e.json.kubernetes.pod_name}_prod_orders-api` },
      ];
      for (const f of fields) {
        const v = valueOf(e, f);
        if (v !== undefined && f !== '@timestamp') row.push({ field: f, value: v });
      }
      row.push({ field: '@ptr', value: 'CmAKJgoiMTIzNDU2Nzg5MDEyOi9lY3Mvd2Vi' });
      rows.push(row);
    }
    return [{ region: regions[0].region, rows, statistics: { bytesScanned: scanned(from, to, regions), recordsScanned: 2412345, recordsMatched: matched } }];
  }

  // ?demo: a workspace in use, for the README screenshots (scripts/screenshots.mjs).
  const demo = new URLSearchParams(location.search).has('demo');
  const ref = (name, region = 'us-east-1') => ({ name, region, arn: `arn:aws:logs:${region}:123456789012:log-group:${name}:*` });
  const RECENT =
    '# API requests, newest first\nfields @timestamp, level, msg, http.path, http.status, duration_ms\n| filter http.path like /^\\/v1\\//\n| sort @timestamp desc\n| limit 2000';
  const LATENCY =
    'filter ispresent(duration_ms)\n| stats avg(duration_ms) as avg, pct(duration_ms, 95) as p95 by bin(5m)\n| sort bin(5m) desc';
  const ERRORS = 'fields @timestamp, msg, http.path, http.status\n| filter level = "error"\n| stats count() as errors by msg, http.path\n| sort errors desc';
  function demoState() {
    const tabs = [
      { id: 'orders', title: 'Orders API', query: RECENT, savedQueryName: 'Recent requests',
        logGroups: [ref('/aws/eks/prod/orders-api'), ref('/aws/eks/prod/payments')],
        timeRange: { mode: 'relative', amount: 3, unit: 'hours' },
        columns: { widths: { '@timestamp': 200, level: 90, msg: 360, 'http.path': 240, 'http.status': 110 } } },
      { id: 'latency', title: 'Checkout latency', query: LATENCY, savedQueryName: 'Latency by 5 minutes',
        logGroups: [ref('/aws/lambda/checkout-webhook')], timeRange: { mode: 'relative', amount: 24, unit: 'hours' } },
      { id: 'errors', title: 'Errors by path', query: ERRORS, savedQueryName: 'Errors by path',
        logGroups: [ref('/aws/eks/prod/orders-api')], timeRange: { mode: 'relative', amount: 1, unit: 'days' } },
    ];
    return {
      tabs,
      activeTabId: 'orders',
      favorites: [ref('/aws/eks/prod/orders-api'), ref('/aws/eks/prod/payments'), ref('/aws/lambda/checkout-webhook')],
      savedQueries: [
        { name: 'Errors by path', query: ERRORS },
        { name: 'Latency by 5 minutes', query: LATENCY },
        { name: 'Recent requests', query: RECENT },
      ],
      timeZone: 'utc',
      profile: 'prod',
    };
  }

  const handlers = {
    init: async () => ({
      state: demo ? demoState() : undefined,
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
    logGroupFields: async () => [
      '@timestamp', '@message', '@logStream', 'level', 'msg', 'http.method', 'http.path', 'http.status',
      'duration_ms', 'trace_id', 'kubernetes.pod_name', 'user.id', 'user.plan',
    ],
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
