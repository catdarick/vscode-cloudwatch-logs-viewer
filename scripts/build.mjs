// Bundles the extension host (Node) and the webview (browser), plus Monaco's editor worker.
// Usage: node scripts/build.mjs [--watch] [--production]
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

rmSync('dist', { recursive: true, force: true });

const common = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : 'linked',
  logLevel: 'info',
};

const builds = [
  {
    ...common,
    entryPoints: ['src/extension/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: { webview: 'src/webview/index.tsx' },
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'iife',
    target: 'chrome114',
    jsx: 'automatic',
    // Monaco's CSS imports end up in dist/webview/webview.css, its icon font next to it.
    loader: { '.ttf': 'file' },
    define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
  },
  {
    ...common,
    entryPoints: { 'editor.worker': 'monaco-editor/esm/vs/editor/editor.worker.js' },
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'iife',
    target: 'chrome114',
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
