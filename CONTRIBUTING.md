# Contributing

## Setup

```bash
npm install
npm run watch        # bundles into dist/ on every change; F5 in VS Code starts an Extension Development Host
npm run check        # typecheck, tests, production bundle
```

## The webview in a browser

The webview can be looked at in a plain browser with a fake host and canned data: run `npm run build`, serve the
repository root (`python3 -m http.server 5178`) and open `http://localhost:5178/scripts/preview/`. Add
`?theme=light` for the light theme and `?demo` for a workspace with tabs, favorites and saved queries.

## Screenshots

`npm run screenshots` renders the README images into `media/screenshots/` from the preview's `?demo` workspace
(`scripts/screenshots.mjs`). It uses the installed Google Chrome, or Playwright's Chromium after
`npx playwright install chromium`. The Marketplace shows them from GitHub, so they appear there once pushed.

## Layout

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
scripts/
  build.mjs           esbuild bundles for the host, the webview and Monaco's worker
  preview/            the webview in a browser with a fake host
  screenshots.mjs     README screenshots
```

## Releasing

1. Bump `version` in `package.json` and add a section to `CHANGELOG.md`.
2. `npm run check`, then `npx @vscode/vsce package`.
3. `npx @vscode/vsce publish --packagePath cloudwatch-logs-viewer-<version>.vsix`, or upload the `.vsix` at
   https://marketplace.visualstudio.com/manage/publishers/catdarick.
