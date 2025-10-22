/**
 * Query Editor Module
 * Handles query input with syntax highlighting and editor interactions
 */

import { send } from '../../core/messaging';

const KEYWORDS = ['fields', 'filter', 'sort', 'stats', 'limit', 'display', 'parse', 'by', 'as', 'asc', 'desc', 'dedup', 'head', 'tail'];
const FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max', 'earliest', 'latest', 'pct', 'stddev', 'concat', 'strlen', 'toupper', 'tolower', 'trim', 'ltrim', 'rtrim', 'contains', 'replace', 'strcontains', 'ispresent', 'isblank', 'isempty', 'isnull', 'coalesce', 'bin', 'diff', 'floor', 'ceil', 'abs', 'log', 'sqrt', 'exp'];
const OPERATORS = ['like', 'in', 'and', 'or', 'not', 'regex', 'match'];

let persistTimer: number | null = null;
const commentToken = '#';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightLine(line: string): string {
  if (!line) return '\n';
  let result = '';
  let i = 0;
  
  while (i < line.length) {
    // Skip whitespace
    if (/\s/.test(line[i])) {
      result += line[i];
      i++;
      continue;
    }

    // Comments (# to end of line)
    if (line[i] === '#') {
      result += `<span class="token-comment">${escapeHtml(line.slice(i))}</span>`;
      break;
    }

    // Strings (single or double quoted)
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let end = i + 1;
      while (end < line.length && line[end] !== quote) {
        if (line[end] === '\\') end++;
        end++;
      }
      if (end < line.length) end++;
      result += `<span class="token-string">${escapeHtml(line.slice(i, end))}</span>`;
      i = end;
      continue;
    }

    // Regex patterns /pattern/
    if (line[i] === '/') {
      let end = i + 1;
      while (end < line.length && line[end] !== '/') {
        if (line[end] === '\\') end++;
        end++;
      }
      if (end < line.length) end++;
      result += `<span class="token-regex">${escapeHtml(line.slice(i, end))}</span>`;
      i = end;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i])) {
      let end = i;
      while (end < line.length && /[\d.]/.test(line[end])) end++;
      result += `<span class="token-number">${escapeHtml(line.slice(i, end))}</span>`;
      i = end;
      continue;
    }

    // Operators and punctuation
    if (/[|=<>!+\-*/%(),\[\]]/.test(line[i])) {
      result += `<span class="token-operator">${escapeHtml(line[i])}</span>`;
      i++;
      continue;
    }

    // Words (keywords, functions, operators, identifiers)
    if (/[a-zA-Z_@]/.test(line[i])) {
      let end = i;
      while (end < line.length && /[a-zA-Z0-9_@.]/.test(line[end])) end++;
      const word = line.slice(i, end);
      const lowerWord = word.toLowerCase();

      if (KEYWORDS.includes(lowerWord)) {
        result += `<span class="token-keyword">${escapeHtml(word)}</span>`;
      } else if (FUNCTIONS.includes(lowerWord)) {
        result += `<span class="token-function">${escapeHtml(word)}</span>`;
      } else if (OPERATORS.includes(lowerWord)) {
        result += `<span class="token-operator">${escapeHtml(word)}</span>`;
      } else if (word.startsWith('@')) {
        result += `<span class="token-field">${escapeHtml(word)}</span>`;
      } else {
        result += escapeHtml(word);
      }
      i = end;
      continue;
    }

    // Default
    result += escapeHtml(line[i]);
    i++;
  }

  return result;
}

function highlightQuery(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.map(line => highlightLine(line)).join('\n');
}

function syncScroll() {
  const queryEditor = document.getElementById('query') as HTMLTextAreaElement | null;
  const queryHighlight = document.getElementById('queryHighlight');
  
  if (queryEditor && queryHighlight) {
    queryHighlight.scrollTop = queryEditor.scrollTop;
    queryHighlight.scrollLeft = queryEditor.scrollLeft;
  }
}

function updateSyntaxHighlighting() {
  const queryEditor = document.getElementById('query') as HTMLTextAreaElement | null;
  const queryHighlight = document.getElementById('queryHighlight');
  
  if (!queryEditor || !queryHighlight) return;
  
  const text = queryEditor.value;
  queryHighlight.innerHTML = highlightQuery(text);
  syncScroll();
}

function schedulePersistLastQuery() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      const queryEditor = document.getElementById('query') as HTMLTextAreaElement | null;
      const query = queryEditor?.value || '';
      send({ type: 'updateLastQuery', query });
    } catch (_) { /* ignore */ }
  }, 400);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toggleCommentInQueryEditor() {
  const editor = document.getElementById('query') as HTMLTextAreaElement | null;
  if (!editor) return;
  
  const text = editor.value;
  let selStart = editor.selectionStart;
  let selEnd = editor.selectionEnd;
  
  if (selStart === selEnd) {
    selStart = text.lastIndexOf('\n', selStart - 1) + 1;
    const next = text.indexOf('\n', selEnd);
    selEnd = next === -1 ? text.length : next;
  } else {
    selStart = text.lastIndexOf('\n', selStart - 1) + 1;
    const after = text.indexOf('\n', selEnd);
    selEnd = after === -1 ? text.length : after;
  }
  
  const block = text.slice(selStart, selEnd);
  const lines = block.split('\n');
  const nonEmpty = lines.filter(l => l.trim() !== '');
  
  const isCommented = (l: string) => {
    const indentMatch = /^[\t ]*/.exec(l) || [''];
    const afterIndent = l.slice(indentMatch[0].length);
    return afterIndent.startsWith(commentToken);
  };
  
  const allCommented = nonEmpty.length > 0 && nonEmpty.every(isCommented);
  
  const out = lines.map(line => {
    if (line.trim() === '') return line;
    const indentMatch = /^[\t ]*/.exec(line) || [''];
    const indent = indentMatch[0];
    const afterIndent = line.slice(indent.length);
    
    if (allCommented) {
      const escapedToken = escapeForRegex(commentToken);
      const withSpace = new RegExp(`^${escapedToken} ?`);
      return indent + afterIndent.replace(withSpace, '');
    } else {
      return indent + commentToken + ' ' + afterIndent;
    }
  }).join('\n');
  
  editor.value = text.slice(0, selStart) + out + text.slice(selEnd);
  editor.selectionStart = selStart;
  editor.selectionEnd = selStart + out.length;
  updateSyntaxHighlighting();
}

/**
 * Initialize query editor UI and event listeners
 */
export function initQueryEditorUI() {
  const queryEditor = document.getElementById('query') as HTMLTextAreaElement | null;
  
  if (!queryEditor) return;
  
  queryEditor.addEventListener('input', () => {
    updateSyntaxHighlighting();
    schedulePersistLastQuery();
  });
  
  queryEditor.addEventListener('scroll', syncScroll);
  
  // Initialize syntax highlighting
  updateSyntaxHighlighting();
}

/**
 * Get query text
 */
export function getQueryText(): string {
  const editor = document.getElementById('query') as HTMLTextAreaElement | null;
  return editor?.value || '';
}

/**
 * Set query text
 */
export function setQueryText(text: string) {
  const editor = document.getElementById('query') as HTMLTextAreaElement | null;
  if (editor) {
    editor.value = text;
    updateSyntaxHighlighting();
  }
}
