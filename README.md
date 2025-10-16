# CloudWatch Logs Viewer (VS Code Extension)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg) ![AWS](https://img.shields.io/badge/AWS-CloudWatch-orange) ![Status](https://img.shields.io/badge/status-alpha-blue)

Query AWS CloudWatch Logs Insights directly inside VS Code. Select relative or absolute time ranges (like the AWS Console), write queries with inline syntax highlighting, mark favorite log groups, and manage saved queries (AWS-managed or local fallback).

> This is an early release (0.1.x). Feedback and contributions are very welcome.

## Features

Core
* Interactive webview to run Logs Insights queries (multi-log-group)
* Relative time presets: 5m, 15m, 30m, 1h, 3h, 12h, 24h, 3d, 7d, 30d
* Absolute UTC start/end with quick "Now" buttons & copy start→end
* Lightweight inline syntax highlighting (keywords, functions, fields, strings, regex, numbers, comments)
* Favorites: star frequently used log groups (per region) and quick-select them
* Saved Queries: load/save/delete AWS Query Definitions (falls back to local storage if IAM/API not permitted)
* Incremental search within results (match navigation & optional hide non-matching rows)
* Resizable result table columns & sticky headers

Reliability & UX
* Abort previous query when a new one starts (prevents overlapping polling)
* Output channel logging (non-intrusive)
* Graceful fallback for saved queries and log group listing errors
* Minimal network client churn via AWS SDK client cache

Configurable
* Default region (`cloudwatchLogsViewer.defaultRegion`)
* Query poll interval / timeout (`cloudwatchLogsViewer.queryPollIntervalMs`, `cloudwatchLogsViewer.queryTimeoutMs`)

Security / Credentials
* Uses the AWS SDK v3 default credential resolution (env vars, shared config/credentials, SSO, EC2/ECS roles, etc.)

## Requirements

You must have AWS credentials available locally (e.g. `~/.aws/credentials` or env vars like `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`). If you use SSO or MFA, ensure the session/token is refreshed. Permissions required:

* `logs:StartQuery`
* `logs:GetQueryResults`
* `logs:DescribeLogGroups`
* (Optional) `logs:DescribeQueryDefinitions`, `logs:PutQueryDefinition`, `logs:DeleteQueryDefinition` (if you want AWS-backed saved queries)

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

## Installation

From the VS Code Marketplace (pending publication) search for "CloudWatch Logs Viewer" or install manually:

```
vsce package
code --install-extension cloudwatch-logs-viewer-0.1.0.vsix
```

Or clone and run from source (see Development below).

## Usage

1. Run: `CloudWatch Logs: Open Viewer`.
2. (Optional) Set region and load log groups (Other Groups → Refresh). Mark favorites with ☆.
3. Select one or more log groups (favorites or others).
4. Choose a relative preset OR switch to Absolute and set start/end (UTC).
5. Compose a Logs Insights query. Inline highlighting helps scan structure.
6. Run the query. Use search to filter results. Columns are auto-derived from row fields.
7. Save queries: either AWS Query Definitions (if permitted) or local fallback store.

## Notes & Limitations

* Currently returns the full result set that CloudWatch Logs Insights API returns (no pagination UI yet).
* Column order is derived from the union of encountered fields (excluding `@ptr`).
* Absolute time inputs are treated as UTC. Relative presets use current time at execution.
* Syntax highlighting is heuristic and not a full parser (kept dependency-free for lightness).
* AWS Query Definition APIs may not be allowed by some org policies; the extension falls back to local saved queries seamlessly.

## Roadmap / Ideas

Planned / Potential:
* Region dropdown & recent history
* Credential profile selector
* Pagination & result size limiting
* Export results (CSV / JSON)
* Improved syntax highlighting & IntelliSense (optionally via language server)
* Quick insert of common query snippets
* Inline field value expand / collapse for large JSON payloads
* Multi-account / multi-region favorites management
* Test coverage & automated CI publish workflow

PRs / issues welcome.

## Development

Install dependencies & build:

```
npm install
npm run compile
npm run package
```

Press F5 in VS Code to launch an Extension Development Host.

While developing you can run: `npm run package -- --watch` (a task named "Watch TypeScript" is provided).

### Lint

```
npm run lint
```

### Packaging & Publish

1. Set `publisher` in `package.json` to a registered Marketplace publisher id.
2. Ensure `icon.png` (256x256) exists in `media/`.
3. Bump version.
4. Run `vsce package` (or `npx @vscode/vsce package`).
5. Run `vsce publish` with a Personal Access Token.

## Changelog

### 0.1.0
* Initial public alpha
* Favorites, AWS/local saved queries, relative & absolute time ranges
* Inline syntax highlighting & search within results

---

## License

MIT
