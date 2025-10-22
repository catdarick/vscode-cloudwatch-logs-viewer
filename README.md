# CloudWatch Logs Viewer

Query AWS CloudWatch Logs Insights without leaving VS Code.

## Why Use It?
Fast, lightweight panel for exploring CloudWatch Logs: pick log groups, set a time range, run an Insights query, search & highlight results, and re‑use saved queries.

## Key Features
* **Multi-Tab Interface**: Keep multiple query results open simultaneously. Switch between tabs to compare different query results without losing your work.
* **Multi Log Group Querying**: Query across multiple log groups with relative time presets (e.g., last 1h, 24h) or absolute UTC time ranges.
* **Smart Time Parsing**: Paste date/time strings into Absolute range inputs—auto-parses multiple formats including ISO8601, Unix timestamps, and common date formats.
* **Query Persistence**: Automatically restores your last edited query when reopening the viewer.
* **Favorites System**: Star frequently used log groups per region for quick access.
* **Syntax Highlighting**: Inline syntax highlighting for CloudWatch Logs Insights queries.
* **Saved Queries**: Save and reuse queries using AWS Query Definitions (with local fallback if permissions not available).
* **Advanced Result Filtering**: In-result search with highlighting, hide non-matching rows, and column-based filtering.
* **Resizable Columns**: Adjust column widths and enjoy sticky headers for easy navigation.
* **Query Control**: Abort running queries with one click; new queries automatically abort previous ones.

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
```

### Query Editor Comment Shortcut
Use **Cmd+/** (macOS) or **Ctrl+/** (Windows/Linux) to toggle comments on the selected lines (or current line) inside the query editor. You can override the keybinding in your personal `keybindings.json` targeting `cloudwatchLogsViewer.toggleComment` with the `when` clause `cloudwatchLogsViewerFocus`. Comment token is fixed to `#` for CloudWatch Logs Insights.

## Quick Start
1. **Open the viewer**: Run `CloudWatch Logs: Open Viewer` from the command palette.
2. **Configure region**: Enter/select your AWS region and refresh log groups.
3. **Select log groups**: Choose one or more log groups. Star favorites for quick access later.
4. **Set time range**: Pick a relative time preset (e.g., Last 1h) or switch to Absolute for custom UTC ranges.
5. **Write your query**: Use the query editor with syntax highlighting (a sample query is provided).
6. **Run and explore**: Click Run to execute. Results appear in the current tab.
7. **Use tabs for comparison**: Click "+ New Tab" before running another query to preserve current results and compare them later.
8. **Search and filter**: Use the search bar to find specific text, or apply column filters to narrow results.


## Changelog
0.3.0 – Added multi-tab interface for managing multiple query results simultaneously (DataGrip-style tabs).
0.2.4 – Added paste parsing for Absolute time range (multiple date/time formats).
0.2.0 – Removed deprecated Run Last Query & Save Current Query commands; use the panel buttons instead. Fixed bugs URL metadata.
0.1.0 – Initial public alpha.

## License
MIT
