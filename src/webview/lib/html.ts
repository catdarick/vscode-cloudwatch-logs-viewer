// HTML-related utility helpers extracted from the legacy webview.js
// Pure functions only; no DOM access.

/** Escape characters that would break HTML rendering when injecting text */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
