# Changelog

## 0.4.0

Rewritten after the Grafana CloudWatch Logs app, still calling AWS directly.

- Each tab is a full workspace: its own log groups, query, time range and results. Double-click to rename.
- Log groups: chips with a picker for favorites and search by prefix in any region; groups from several regions
  run as separate queries and their rows are merged.
- Monaco query editor: highlighting, autocomplete of commands, functions and fields, syntax checks underlined as you
  type, Ctrl/Cmd+Enter to run, Ctrl/Cmd+S to save, Ctrl/Cmd+/ to comment.
- Saved queries are kept by the extension (no longer as AWS query definitions). On the first start, saved queries,
  favorites and the last query of 0.3 are carried over, including the account's query definitions in the default
  region.
- Time range: relative quick buttons or absolute with pasted times and a calendar; a time zone picker for absolute
  times and results.
- Results: histogram by level with zoom and the part cut off by `limit` hatched; virtualized table with column
  filters, search, resizable/hideable/reorderable columns, raw JSON fields as columns; expanded rows as a JSON tree
  with filter actions; table filters offered as `| filter` lines in the editor; CSV export; cost estimate.
- Results layout switch: the query pinned on top with the table under it (default, with "Expand results"), or the
  query scrolling away with the logs (page and table scroll as one, with a single scrollbar).
- The Run button shows what the query would scan and cost, from CloudWatch's free `estimate`, updated on its own
  after the log groups, range or profile change, and after a pause in typing the query or when the editor loses
  focus.
- Copy a `vscode://` link to a query; opening it puts the query in a tab.
- Waits for a query with `DescribeQueries` and downloads its results once, so large results do not come down on
  every check. Results come gzipped, and `@message` comes once when the query returns it itself. Timings and
  sizes of each query are in the "CloudWatch Logs" output channel.
- AWS profile picker in the top bar; Stop calls `StopQuery`; CloudWatch's error messages are shown as they are,
  with the query's own syntax problems listed under them.
- New settings `cloudwatchLogsViewer.awsProfile` and `cloudwatchLogsViewer.costPerGb`; the default query timeout
  is now 30 minutes. The separate "Toggle Comment" command is gone: the editor handles Ctrl/Cmd+/ itself.
- The panel comes back after VS Code restarts.

## 0.3.0

Multi-tab interface for keeping several query results open.

## 0.2.4

Paste parsing for the absolute time range.

## 0.2.0

Removed the Run Last Query and Save Current Query commands.

## 0.1.0

Initial public alpha.
