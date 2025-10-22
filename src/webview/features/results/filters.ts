import { getState, getActiveTab, updateTab, setTabColumnFilters } from '../../core/state';
import { renderTabs } from '../tabs/render';
import { notifyInfo } from '../../components/status';

let activeFilters: Record<string, Set<string>> = {};
let currentFilterModal: HTMLElement | null = null;

function getActiveResultsContainer(): HTMLElement | null {
  const s = getState();
  if (s.activeTabId == null) return null;
  return document.getElementById(`results-${s.activeTabId}`);
}

export function clearAllFilters() {
  activeFilters = {};
  applyColumnFilters();
  updateFilterIndicators();
}

function collapseDetailIfHidden(row: HTMLElement) {
  const detailRow = row.nextElementSibling;
  if (detailRow && detailRow.classList.contains('detail-row')) detailRow.classList.add('row-hidden');
}

function getColumnValueCounts(fieldName: string): Map<string, number> {
  const valueCountMap = new Map<string, number>();
  const container = getActiveResultsContainer();
  if (!container) return valueCountMap;
  const rows = Array.from<Element>(container.querySelectorAll('tbody tr:not(.detail-row)'));
  rows.forEach((row) => {
    const cell = row.querySelector(`td[data-field="${fieldName}"]`);
    if (cell) {
      const value = (cell.textContent || '').trim();
      valueCountMap.set(value, (valueCountMap.get(value) || 0) + 1);
    }
  });
  return valueCountMap;
}

export function showColumnFilter(fieldName: string, buttonElement: HTMLElement) {
  if (currentFilterModal) {
    currentFilterModal.remove();
    currentFilterModal = null;
    return;
  }
  const valueCountMap = getColumnValueCounts(fieldName);
  const sortedValues = Array.from(valueCountMap.entries()).sort((a, b) => b[1] - a[1]);
  const modal = document.createElement('div');
  modal.className = 'column-filter-modal';
  currentFilterModal = modal;
  const rect = buttonElement.getBoundingClientRect();
  modal.style.position = 'fixed';
  modal.style.top = `${rect.bottom + 5}px`;
  modal.style.left = `${rect.left - 150}px`;
  const header = document.createElement('div'); header.className = 'filter-modal-header'; header.textContent = `Filter: ${fieldName}`; modal.appendChild(header);
  const searchInput = document.createElement('input') as HTMLInputElement; searchInput.type = 'text'; searchInput.className = 'filter-search-input'; searchInput.placeholder = 'Search values...'; modal.appendChild(searchInput);
  const valuesList = document.createElement('div'); valuesList.className = 'filter-values-list';
  function renderValuesList(filterText = '') {
    valuesList.innerHTML = '';
    const lower = filterText.toLowerCase();
    const filtered = sortedValues.filter(([value]) => value.toLowerCase().includes(lower));
    if (!filtered.length) { const empty = document.createElement('div'); empty.className = 'filter-value-empty'; empty.textContent = 'No matching values'; valuesList.appendChild(empty); return; }
    filtered.forEach(([value, count]) => {
      const item = document.createElement('div'); item.className = 'filter-value-item';
      const checkbox = document.createElement('input') as HTMLInputElement; checkbox.type = 'checkbox'; checkbox.id = `filter-${fieldName}-${value}`;
      const fieldFilters = activeFilters[fieldName];
      checkbox.checked = !fieldFilters || fieldFilters.has(value);
      checkbox.addEventListener('change', () => toggleFilterValue(fieldName, value));
      const label = document.createElement('label') as HTMLLabelElement; label.htmlFor = checkbox.id; label.className = 'filter-value-label';
      const valueSpan = document.createElement('span'); valueSpan.className = 'filter-value-text'; valueSpan.textContent = value || '(empty)';
      const countSpan = document.createElement('span'); countSpan.className = 'filter-value-count'; countSpan.textContent = String(count);
      label.appendChild(valueSpan); label.appendChild(countSpan);
      item.appendChild(checkbox); item.appendChild(label); valuesList.appendChild(item);
    });
  }
  renderValuesList();
  searchInput.addEventListener('input', e => renderValuesList((e.target as HTMLInputElement).value));
  modal.appendChild(valuesList);
  const actions = document.createElement('div'); actions.className = 'filter-modal-actions';
  const selectAllBtn = document.createElement('button'); selectAllBtn.textContent = 'Select All'; selectAllBtn.className = 'filter-action-btn'; selectAllBtn.addEventListener('click', () => { delete activeFilters[fieldName]; renderValuesList((searchInput as HTMLInputElement).value); applyColumnFilters(); updateFilterIndicators(); });
  const clearBtn = document.createElement('button'); clearBtn.textContent = 'Clear'; clearBtn.className = 'filter-action-btn'; clearBtn.addEventListener('click', () => { activeFilters[fieldName] = new Set(); renderValuesList((searchInput as HTMLInputElement).value); applyColumnFilters(); updateFilterIndicators(); });
  const closeBtn = document.createElement('button'); closeBtn.textContent = 'Close'; closeBtn.className = 'filter-action-btn filter-close-btn'; closeBtn.addEventListener('click', () => { modal.remove(); currentFilterModal = null; });
  actions.appendChild(selectAllBtn); actions.appendChild(clearBtn); actions.appendChild(closeBtn); modal.appendChild(actions);
  document.body.appendChild(modal);
  setTimeout(() => { document.addEventListener('click', handleOutsideClick); }, 0);
  function handleOutsideClick(e: MouseEvent) {
    if (!modal.contains(e.target as Node) && !buttonElement.contains(e.target as Node)) {
      modal.remove(); currentFilterModal = null; document.removeEventListener('click', handleOutsideClick);
    }
  }
  searchInput.focus();
}

function toggleFilterValue(fieldName: string, value: string) {
  if (!activeFilters[fieldName]) {
    const allValues = new Set<string>();
    const container = getActiveResultsContainer();
    if (!container) return;
    const rows = Array.from<Element>(container.querySelectorAll('tbody tr:not(.detail-row)'));
    rows.forEach((row) => {
      const cell = row.querySelector(`td[data-field="${fieldName}"]`);
      if (cell) allValues.add((cell.textContent || '').trim());
    });
    activeFilters[fieldName] = allValues;
  }
  const fieldFilters = activeFilters[fieldName];
  if (fieldFilters.has(value)) fieldFilters.delete(value); else fieldFilters.add(value);
  const totalValues = getColumnValueCounts(fieldName).size;
  if (fieldFilters.size === totalValues) delete activeFilters[fieldName];
  applyColumnFilters();
  updateFilterIndicators();
}

function applyColumnFilters() {
  const container = getActiveResultsContainer();
  if (!container) return;
  const rows = Array.from<Element>(container.querySelectorAll('tbody tr:not(.detail-row)'));
  rows.forEach((row) => {
    let shouldShow = true;
    for (const [fname, allowed] of Object.entries(activeFilters)) {
      if (allowed.size === 0) { shouldShow = false; break; }
      const cell = row.querySelector(`td[data-field="${fname}"]`);
      if (cell) {
        const val = (cell.textContent || '').trim();
        if (!allowed.has(val)) { shouldShow = false; break; }
      }
    }
    if (shouldShow) {
      (row as HTMLElement).style.display = '';
    } else {
      (row as HTMLElement).style.display = 'none'; collapseDetailIfHidden(row as HTMLElement);
    }
  });
  
  const s = getState();
  const activeTab = getActiveTab();
  if (activeTab && s.activeTabId) {
    // Use state action to update column filters
    const columnFilters: Record<string, Set<string>> = {};
    for (const [fieldName, allowedValues] of Object.entries(activeFilters)) {
      columnFilters[fieldName] = new Set(allowedValues);
    }
    setTabColumnFilters(s, s.activeTabId, columnFilters);
  }
  
  renderTabs();
  const rowCountText = buildRowCountStatus();
  if (rowCountText) {
    const statusText = `Query complete${rowCountText}`;
    notifyInfo(statusText);
    if (activeTab && s.activeTabId) {
      updateTab(s, s.activeTabId, { status: statusText });
    }
  }
}

function buildRowCountStatus(): string {
  const tab = getActiveTab();
  if (!tab || !tab.results || !tab.results.rows) return '';
  const totalRows = tab.results.rows.length;
  const container = getActiveResultsContainer(); if (!container) return '';
  const visible = Array.from(container.querySelectorAll('tbody tr:not(.detail-row)')).filter(r => (r as HTMLElement).style.display !== 'none').length;
  if (!Object.keys(activeFilters).length) return ` (${totalRows} rows)`;
  return ` (${visible} of ${totalRows} rows)`;
}

function updateFilterIndicators() {
  const container = getActiveResultsContainer(); if (!container) return;
  const headers = Array.from<Element>(container.querySelectorAll('thead th[data-field]'));
  headers.forEach((th) => {
    const fieldName = (th as HTMLElement).dataset.field || '';
    const btn = th.querySelector('.column-filter-btn');
    if (btn) btn.classList.toggle('active', !!activeFilters[fieldName]);
  });
}

export function initFiltersForNewResults() { updateFilterIndicators(); }
