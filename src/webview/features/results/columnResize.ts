/**
 * Column resizing functionality.
 * Extracted from render.ts for better organization.
 * NOTE: This logic has been performance-tuned - do not modify algorithm.
 */

let resizingColumn: HTMLElement | null = null;
let resizeStartX = 0;
let resizeStartWidth = 0;

/**
 * Initialize column resize on mousedown.
 * NOTE: This is a performance-critical hot path - do not modify.
 */
export function initColumnResize(e: MouseEvent, th: HTMLElement): void {
  e.preventDefault();
  resizingColumn = th;
  resizeStartX = e.pageX;
  resizeStartWidth = th.offsetWidth;

  document.addEventListener('mousemove', handleColumnResize);
  document.addEventListener('mouseup', stopColumnResize);

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

/**
 * Handle mouse move during resize.
 * Uses direct style manipulation for performance.
 */
function handleColumnResize(e: MouseEvent): void {
  if (!resizingColumn) return;

  const diff = e.pageX - resizeStartX;
  const newWidth = Math.max(50, resizeStartWidth + diff);

  // Direct style manipulation for performance
  resizingColumn.style.width = newWidth + 'px';
  resizingColumn.style.minWidth = newWidth + 'px';
  resizingColumn.style.maxWidth = newWidth + 'px';
}

/**
 * Stop column resize on mouseup.
 */
function stopColumnResize(): void {
  resizingColumn = null;
  document.removeEventListener('mousemove', handleColumnResize);
  document.removeEventListener('mouseup', stopColumnResize);

  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}
