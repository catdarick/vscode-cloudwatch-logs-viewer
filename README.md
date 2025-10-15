# CloudWatch Logs Viewer (VS Code Extension)

Query AWS CloudWatch Logs Insights directly inside VS Code. Select time ranges (like the AWS Console), write queries, and save frequently-used queries.

## Features

- Interactive webview to run Logs Insights queries
- Quick time range selector (5m, 15m, 30m, 1h, 3h, 12h, 24h, 3d, 7d, 30d, Custom)
- Supports custom start/end date-time (local time)
- Save / load / delete named queries (persisted in global storage)
- Configure default region and polling behavior
- Uses your existing AWS CLI credentials (shared credentials / config files, environment variables, SSO, etc.) via the AWS SDK default credential provider chain

## Requirements

You must have AWS credentials available locally (e.g. `~/.aws/credentials` or environment variables like `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, etc.). If you use SSO or MFA, ensure your session is active.

## Extension Settings

Settings (in `settings.json`):

```
"cloudwatchLogsViewer.defaultRegion": "us-east-1",
"cloudwatchLogsViewer.queryPollIntervalMs": 1000,
"cloudwatchLogsViewer.queryTimeoutMs": 60000
```

## Commands

- `CloudWatch Logs: Open Viewer` (`cloudwatchLogsViewer.open`)
- `CloudWatch Logs: Run Last Query` (`cloudwatchLogsViewer.runQuery`)
- `CloudWatch Logs: Save Current Query` (`cloudwatchLogsViewer.saveQuery`)

## Usage

1. Run the command `CloudWatch Logs: Open Viewer`.
2. Enter one or more log group names (comma-separated) and an optional region.
3. Choose a time range or set custom start/end.
4. Write a Logs Insights query and click Run.
5. Save queries with a name for later reuse.

## Notes

- Currently returns the complete result set the API returns (no pagination UI yet).
- Results table columns are the union of fields across all rows.
- Time zone for custom date-times uses your local browser environment (the VS Code webview). Provide UTC values if precision across zones matters.

## Roadmap / Ideas

- Region selector dropdown with recent regions
- Profile selector (for multiple credential profiles)
- Pagination / limit control
- Export results (CSV / JSON)
- Syntax highlighting & IntelliSense for Logs Insights
- Multi-log-group discovery with AWS resource explorer

PRs / issues welcome.

## Development

Install dependencies and build:

```
npm install
npm run compile
npm run package
```

Then press F5 to launch the extension host.

## License

MIT
