# CloudWatch Logs Viewer

CloudWatch Logs Insights inside VS Code: tabs (each with its own log groups, query, time range and results),
favorite log groups, saved queries, a histogram of the loaded logs, value filters, search, and the whole JSON
of every log. Queries go straight to AWS with your own credentials.

## Features

- **Tabs.** Each tab is a full workspace: log groups, query, time range and results. Double-click a tab to rename
  it; the + button copies the current tab.
- **Log groups.** Search by name prefix in any region, star favorites, mix groups from several regions in one
  query (each region runs as its own query and the rows are merged).
- **Query editor.** Logs Insights highlighting, autocomplete for commands, functions and fields (fields CloudWatch
  saw in the selected groups plus fields of their raw JSON logs from recent queries), and checks against the
  documented syntax: errors are underlined in red, unknown commands and functions in yellow. Ctrl/Cmd+Enter runs,
  Ctrl/Cmd+S saves, Ctrl/Cmd+/ comments lines.
- **Saved queries.** Save, save as, rename, delete; the picker shows when the query differs from what was saved.
- **Time range.** Relative (quick buttons or a custom amount of minutes, hours or days) or absolute. Absolute fields
  take pasted times in many formats (ISO, epoch seconds/millis/micros/nanos, `08.10.2026 22:59`, `now-1h`, a whole
  `A - B` range) and have a calendar with the time of each end. Absolute times and results are shown in the time zone
  picked in the top bar.
- **Estimate before running.** The Run button shows what the query would scan and cost ("≈ 1.2 GB · $0.0060"),
  from CloudWatch's free `estimate` (the query with `| estimate` at the end). It is asked for on its own: shortly
  after the log groups, range or profile change, and 5 seconds after typing in the query stops, or as soon as the
  editor loses focus. A query with syntax errors is not estimated. Until the new figure comes, the last one is
  shown faded, with a light wave over it while CloudWatch is being asked; the button itself stays as it is.
- **Results.**
  - A histogram of the loaded rows, stacked by level. Drag or click bars to zoom into the loaded rows; "Run for
    this range" runs the query for that window. Logs that matched but did not fit the `limit` are shown hatched;
    clicking there runs the query for that part.
  - A virtualized table: level badges, column filters with value counts (⋮ in a header), search with
    "Hide non-matching", resize, hide and reorder columns, raw JSON fields as extra columns (Columns → "Add from raw
    log"), and 🔍+/🔍− on every cell.
  - Expand a row for the whole log event as a JSON tree, with table filters and "add to query" on every value.
  - Active table filters appear in the editor as faint `| filter …` lines; click one to put it into the query.
  - Duration, bytes and records scanned, and an estimated cost (GB scanned × price per GB).
  - Results layout, switched next to the stats: "Query pinned" (default) keeps the query on top and gives the table
    the space under it ("Expand results" hides the query altogether); "Query scrolls away" scrolls the page and the
    table as one, so scrolling the logs moves the query out of view and the table gets the whole window, and
    scrolling up anywhere but over the rows brings the query back.
  - Export CSV: shown or all loaded rows, any columns, and the raw `@message`, `@log`, `@logStream`.
- **Links.** The link button copies a `vscode://` link to the query (relative, or pinned to the last run's time
  range). Opening it in VS Code puts the query in a new tab (or selects an identical one) without running it.
- **AWS profiles.** Pick the profile in the top bar; queries, log groups and fields use it.

## How it works

- The extension calls CloudWatch Logs with the AWS SDK: `StartQuery`, then waits with `DescribeQueries` (statuses
  only) and fetches the results once with `GetQueryResults`. Checking with `GetQueryResults` instead would download
  every row found so far on each check, which is slow outside AWS; without the `logs:DescribeQueries` permission
  the extension has to do that, and says so in the output. Responses are requested gzipped (the AWS SDK for Node
  does not ask for that by itself), which makes large results several times smaller. Stop (or running the tab
  again) calls `StopQuery`, so AWS stops scanning too.
- View → Output → "CloudWatch Logs" shows each query's log groups and range, how long starting, running and
  downloading took, and how big the results were on the wire.
- Every query is prefixed (on its first line) with
  `fields @timestamp, @message as …, ltrim(@log) as …, ltrim(@logStream) as … |` so that expanding a row shows the
  whole log, its group and stream. When the query returns `@message` itself, the copy is left out, so it does
  not come down twice. `stats` queries and queries with `display` lack them, and the row's fields are
  shown instead. Error positions CloudWatch reports on the first line are adjusted back to the query as written.
- Tabs, favorites, saved queries and the time zone are kept in VS Code's global state; results only live while
  the panel is open.

## Requirements

AWS credentials the SDK can find: `~/.aws/config` / `~/.aws/credentials` profiles (static keys, `role_arn` +
`source_profile`, SSO after `aws sso login --profile <name>`, `credential_process`), or environment variables.

IAM permissions: `logs:StartQuery`, `logs:GetQueryResults`, `logs:StopQuery`, `logs:DescribeQueries`,
`logs:DescribeLogGroups`, `logs:GetLogGroupFields`. Without `logs:DescribeQueries` queries still work, but take
longer for large results.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `cloudwatchLogsViewer.awsProfile` | empty | Profile the viewer starts with; empty is the default credential chain |
| `cloudwatchLogsViewer.defaultRegion` | `us-east-2` | Region for browsing log groups |
| `cloudwatchLogsViewer.costPerGb` | `0.005` | USD per GB scanned, for the cost estimate |
| `cloudwatchLogsViewer.queryTimeoutMs` | `1800000` | How long to wait for a query before stopping it |

## Command

- **CloudWatch Logs: Open Viewer** (`cloudwatchLogsViewer.open`)

## Development

```bash
npm install
npm run watch        # bundles into dist/ on every change; F5 in VS Code starts an Extension Development Host
npm run check        # typecheck, tests, production bundle
```

The webview can also be looked at in a plain browser with a fake host and canned data: run `npm run build`,
serve the repository root (`python3 -m http.server 5178`) and open
`http://localhost:5178/scripts/preview/` (add `?theme=light` for the light theme).

```
src/
  extension/          extension host: AWS calls, storage, the webview panel, share links
  shared/             types and messages shared by both sides
  webview/
    api/cloudwatch.ts   query building, result parsing
    components/         App, tabs, log groups, editor, time picker, results (table, histogram, JSON tree)
    language/           Logs Insights tokenizer, checks, autocomplete, Monaco registration
    state/              workspace, raw field history, table views
    ui/                 buttons, inputs, popups, Monaco wrapper, styled with VS Code's theme colours
    utils/              table logic, time parsing and zones, CSV, cost, links
```

## License

MIT
