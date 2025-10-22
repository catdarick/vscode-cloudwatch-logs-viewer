import { QueryRow } from '../../types/domain';
import { jsonToYaml, highlightYaml } from '../../lib/yaml';

// Toggle a detail row showing the parsed @message field (JSON -> YAML highlighted) or raw text.
export function toggleRowDetails(tr: HTMLTableRowElement, rowData: QueryRow) {
  const already = tr.nextSibling && (tr.nextSibling as HTMLElement).classList?.contains('detail-row');
  const expandBtn = tr.querySelector('.expand-btn') as HTMLElement | null;
  if (already) {
    tr.parentNode?.removeChild(tr.nextSibling!);
    if (expandBtn) { expandBtn.textContent = '›'; expandBtn.title = 'Show details'; }
    return;
  }
  const detailTr = document.createElement('tr') as HTMLTableRowElement;
  detailTr.className = 'detail-row';
  const td = document.createElement('td') as HTMLTableCellElement;
  td.colSpan = tr.children.length;
  const pre = document.createElement('pre');
  pre.className = 'detail-json';
  const messageField = rowData.fields.find(f => f.field === '@message');
  const messageValue = messageField ? messageField.value : '(no @message)';
  if (messageValue && /^(\s*[\[{])/.test(messageValue)) {
    try {
      const parsed = JSON.parse(messageValue);
      const yaml = jsonToYaml(parsed);
      pre.innerHTML = highlightYaml(yaml);
    } catch {
      pre.textContent = messageValue || '';
    }
  } else {
    pre.textContent = messageValue || '';
  }
  td.appendChild(pre);
  detailTr.appendChild(td);
  // Cast parentNode to Node & detailTr to Node to appease narrowed lib typings
  (tr.parentNode as Node | null)?.insertBefore(detailTr as unknown as Node, tr.nextSibling);
  if (expandBtn) { expandBtn.textContent = '⌄'; expandBtn.title = 'Hide details'; }
}
