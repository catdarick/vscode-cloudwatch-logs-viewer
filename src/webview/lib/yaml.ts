// YAML / JSON conversion & highlighting utilities extracted from legacy webview.js
// Pure functions; no DOM access.
import { escapeHtml } from './html';

/** Convert a plain JS value (object/array/scalar) into a simplistic YAML string. */
export function jsonToYaml(root: any): string {
  const lines: string[] = [];
  const quoteIfNeeded = (s: string): string => {
    if (s === '') return '""';
    if (/^(?:true|false|null|[-+]?[0-9]+(?:\.[0-9]+)?)$/i.test(s)) return '"' + s + '"';
    if (/[:\-?&*!|>'"@`{}#%\n\t]/.test(s)) return JSON.stringify(s);
    return s;
  };
  const indent = (lvl: number) => '  '.repeat(lvl);
  const emit = (lvl: number, text: string) => lines.push(indent(lvl) + text);
  const isScalar = (v: any) => v === null || ['string','number','boolean'].includes(typeof v);
  function walk(val: any, lvl: number) {
    if (val === null) { emit(lvl, 'null'); return; }
    if (Array.isArray(val)) {
      if (!val.length) { emit(lvl, '[]'); return; }
      val.forEach(item => {
        if (isScalar(item)) {
          if (typeof item === 'string' && /\n/.test(item)) {
            emit(lvl, '- |');
            item.split('\n').forEach(l => emit(lvl + 1, l));
          } else {
            emit(lvl, '- ' + (typeof item === 'string' ? quoteIfNeeded(item) : String(item)));
          }
        } else {
          emit(lvl, '-');
          walk(item, lvl + 1);
        }
      });
      return;
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (!keys.length) { emit(lvl, '{}'); return; }
      keys.forEach(k => {
        const v = val[k];
        if (isScalar(v)) {
          if (typeof v === 'string' && /\n/.test(v)) {
            emit(lvl, k + ': |');
            v.split('\n').forEach(l => emit(lvl + 1, l));
          } else {
            emit(lvl, k + ': ' + (typeof v === 'string' ? quoteIfNeeded(v) : String(v)));
          }
        } else if (Array.isArray(v)) {
          if (!v.length) emit(lvl, k + ': []');
          else { emit(lvl, k + ':'); walk(v, lvl + 1); }
        } else {
          const childKeys = Object.keys(v);
          if (!childKeys.length) emit(lvl, k + ': {}');
          else { emit(lvl, k + ':'); walk(v, lvl + 1); }
        }
      });
      return;
    }
    if (typeof val === 'string') {
      if (/\n/.test(val)) {
        emit(lvl, '|');
        val.split('\n').forEach(l => emit(lvl + 1, l));
      } else emit(lvl, quoteIfNeeded(val));
      return;
    }
    if (typeof val === 'number' || typeof val === 'boolean') { emit(lvl, String(val)); return; }
    emit(lvl, JSON.stringify(val));
  }
  walk(root, 0);
  return lines.join('\n');
}

/** Highlight YAML text using span tokens; avoids block scalar content highlighting */
export function highlightYaml(yamlText: string): string {
  const lines = yamlText.split('\n');
  const result: string[] = [];
  let inBlock = false; let blockIndent = 0;
  for (const line of lines) {
    if (!inBlock) {
      const trimmed = line.trimEnd();
      if (/^\s*[^:#]+:\s*[|>][-+]?\s*$/.test(trimmed) || /^\s*[|>][-+]?\s*$/.test(trimmed) || /^\s*-\s*[|>][-+]?\s*$/.test(trimmed)) {
        inBlock = true;
        blockIndent = (/^\s*/.exec(line)?.[0].length || 0) + 1;
        result.push(escapeHtml(line));
        continue;
      }
      let hl = escapeHtml(line)
        .replace(/^(\s*)([^\s][^:]*?):/g, (m, indent, key) => `${indent}<span class="token-field">${escapeHtml(key)}</span>:`)
        .replace(/\b(true|false|null)\b/g, '<span class="token-operator">$1</span>')
        .replace(/(-?\b\d+(?:\.\d+)?\b)/g, '<span class="token-number">$1</span>')
        .replace(/(&quot;.*?&quot;)/g, '<span class="token-string">$1</span>');
      result.push(hl);
    } else {
      result.push(escapeHtml(line));
      const currentIndent = /^\s*/.exec(line)?.[0].length || 0;
      if (line.trim() === '' || currentIndent < blockIndent) inBlock = false;
    }
  }
  return result.join('\n');
}
