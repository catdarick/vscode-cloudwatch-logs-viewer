# CloudWatch Logs Viewer

Query AWS CloudWatch Logs Insights without leaving VS Code.

## Why Use It?
Fast, lightweight panel for exploring CloudWatch Logs: pick log groups, set a time range, run an Insights query, search & highlight results, and re‑use saved queries.

## Key Features (Concise)
* Multi log group querying (relative presets & absolute UTC range)
* Quick favorites: star frequent log groups per region
* Inline syntax highlighting (no extra dependencies)
* Saved queries (AWS Query Definitions with local fallback)
* In‑result search & hide non‑matching rows
* Resizable columns, sticky headers, abort on new run

## Requirements & Permissions
Provide AWS credentials (shared config/env/SSO/role). Minimum IAM:
`logs:StartQuery`, `logs:GetQueryResults`, `logs:DescribeLogGroups`
Optional for saved queries: `logs:DescribeQueryDefinitions`, `logs:PutQueryDefinition`, `logs:DeleteQueryDefinition`.

## Command
* CloudWatch Logs: Open Viewer (`cloudwatchLogsViewer.open`)
* CloudWatch Logs: Toggle Comment (`cloudwatchLogsViewer.toggleComment`)

## Settings
```
cloudwatchLogsViewer.defaultRegion        (string, default us-east-1)
cloudwatchLogsViewer.queryPollIntervalMs  (number, default 1000)
cloudwatchLogsViewer.queryTimeoutMs       (number, default 60000)
cloudwatchLogsViewer.commentToken         (string, default '#')
```

### Query Editor Comment Shortcut
Use Cmd+/ (macOS) or Ctrl+/ (Windows/Linux) to toggle comments on the selected lines (or current line) inside the query editor. You can override the keybinding in your personal `keybindings.json` targeting `cloudwatchLogsViewer.toggleComment` with the `when` clause `cloudwatchLogsViewerFocus`.

To change the comment token (default `#`), set the `cloudwatchLogsViewer.commentToken` setting (e.g. to `//`).

## Quick Start
1. Open the command palette and run: CloudWatch Logs: Open Viewer.
2. Enter/select region; refresh log groups; star favorites if desired.
3. Select one or more log groups.
4. Pick a relative time preset or switch to Absolute and set start/end.
5. Write your Logs Insights query (sample provided) and Run.
6. Search within results or save the query for later.

## Notes
* Full result set returned (pagination UI not yet implemented).
* Absolute times interpreted as UTC.
* Falls back to local saved queries if AWS definition APIs not permitted.

## Changelog
0.2.0 – Removed deprecated Run Last Query & Save Current Query commands; use the panel buttons instead. Fixed bugs URL metadata.
0.1.0 – Initial public alpha.

## License
MIT
