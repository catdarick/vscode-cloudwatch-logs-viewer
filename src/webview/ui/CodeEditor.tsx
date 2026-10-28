import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
import type { Monaco } from '../language/logsInsights';

export type MonacoEditor = monaco.editor.IStandaloneCodeEditor;
export type { Monaco };

// Webviews cannot start a worker from their resource URLs, so fetch the script and start it from a blob.
window.MonacoEnvironment = {
  getWorker: async () => {
    const url = document.getElementById('root')?.dataset.worker ?? 'editor.worker.js';
    const code = await (await fetch(url)).text();
    return new Worker(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
  },
};

const THEME = 'vscode-current';

const css = (name: string) => getComputedStyle(document.body).getPropertyValue(`--vscode-${name}`).trim();

/** A Monaco theme from VS Code's current colours, so the editor looks like the rest of VS Code. */
function applyTheme() {
  const kind = document.body.classList.contains('vscode-high-contrast-light')
    ? 'hc-light'
    : document.body.classList.contains('vscode-high-contrast')
      ? 'hc-black'
      : document.body.classList.contains('vscode-light')
        ? 'vs'
        : 'vs-dark';
  const colors: Record<string, string> = {};
  const map: Record<string, string> = {
    'editor.background': 'editor-background',
    'editor.foreground': 'editor-foreground',
    'editorLineNumber.foreground': 'editorLineNumber-foreground',
    'editorLineNumber.activeForeground': 'editorLineNumber-activeForeground',
    'editorCursor.foreground': 'editorCursor-foreground',
    'editor.selectionBackground': 'editor-selectionBackground',
    'editor.inactiveSelectionBackground': 'editor-inactiveSelectionBackground',
    'editorSuggestWidget.background': 'editorSuggestWidget-background',
    'editorSuggestWidget.border': 'editorSuggestWidget-border',
    'editorSuggestWidget.foreground': 'editorSuggestWidget-foreground',
    'editorSuggestWidget.selectedBackground': 'editorSuggestWidget-selectedBackground',
    'editorSuggestWidget.highlightForeground': 'editorSuggestWidget-highlightForeground',
    'editorHoverWidget.background': 'editorHoverWidget-background',
    'editorHoverWidget.border': 'editorHoverWidget-border',
    'editorWidget.background': 'editorWidget-background',
    'editorError.foreground': 'editorError-foreground',
    'editorWarning.foreground': 'editorWarning-foreground',
    'editorInfo.foreground': 'editorInfo-foreground',
    'focusBorder': 'focusBorder',
  };
  for (const [key, variable] of Object.entries(map)) {
    const value = css(variable);
    if (/^#[0-9a-f]{3,8}$/i.test(value)) {
      colors[key] = value;
    }
  }
  monaco.editor.defineTheme(THEME, { base: kind, inherit: true, rules: [], colors });
  monaco.editor.setTheme(THEME);
}

let themeWatched = false;

function watchTheme() {
  if (themeWatched) {
    return;
  }
  themeWatched = true;
  applyTheme();
  // VS Code switches the body's classes and variables when the colour theme changes.
  new MutationObserver(applyTheme).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
}

interface Props {
  language: string;
  value: string;
  height?: string;
  showLineNumbers?: boolean;
  showMiniMap?: boolean;
  containerStyles?: string;
  monacoOptions?: monaco.editor.IStandaloneEditorConstructionOptions;
  onBeforeEditorMount?: (monaco: Monaco) => void;
  onEditorDidMount?: (editor: MonacoEditor, monaco: Monaco) => void;
}

/** Grafana's CodeEditor: Monaco, with the value kept in step with the prop. */
export function CodeEditor({
  language,
  value,
  height = '100%',
  showLineNumbers,
  showMiniMap,
  containerStyles,
  monacoOptions,
  onBeforeEditorMount,
  onEditorDidMount,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor>();

  useEffect(() => {
    onBeforeEditorMount?.(monaco);
    watchTheme();
    const editor = monaco.editor.create(ref.current!, {
      value,
      language,
      theme: THEME,
      automaticLayout: true,
      lineNumbers: showLineNumbers ? 'on' : 'off',
      minimap: { enabled: Boolean(showMiniMap) },
      fontFamily: css('editor-font-family') || undefined,
      ...monacoOptions,
    });
    editorRef.current = editor;
    onEditorDidMount?.(editor, monaco);
    return () => {
      editor.getModel()?.dispose();
      editor.dispose();
    };
    // Created once; later prop changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value set from outside (a saved query, a filter added from the table) replaces the text as
  // one edit, so it can be undone.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || model.getValue() === value) {
      return;
    }
    editor.pushUndoStop();
    editor.executeEdits('value', [{ range: model.getFullModelRange(), text: value }]);
    editor.pushUndoStop();
  }, [value]);

  return <div ref={ref} className={containerStyles} style={{ height }} />;
}
