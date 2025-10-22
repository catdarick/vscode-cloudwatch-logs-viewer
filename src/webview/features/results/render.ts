/**
 * Results table rendering coordinator.
 * Simplified using extracted builders and event binders.
 */
import { QueryResults } from '../../types/domain';
import { getState, completeTabQuery, updateTab } from '../../core/state';
import { renderTabs } from '../tabs/render';
import { setStatus } from '../../components/status';
import { scheduleSearchRerun, invalidateRowCache } from '../search/search';
import { clearAllFilters, initFiltersForNewResults } from './filters';
import { TableBuilder } from './builders/TableBuilder';
import { TableEventBinder } from './builders/EventBinder';

function getTabResultsContainer(tabId: number): HTMLElement | null {
  return document.getElementById(`results-${tabId}`);
}

export function renderResults(payload: QueryResults, skipClearFilters = false, forceTabId?: number) {
  const s = getState();
  // Use forceTabId if provided (for tab switching), otherwise use runningQueryTabId or activeTabId
  const targetTabId = forceTabId ?? s.runningQueryTabId ?? s.activeTabId;
  if (targetTabId == null) return;
  
  // Update state using action
  if (!completeTabQuery(s, targetTabId, payload)) return;

  const container = getTabResultsContainer(targetTabId);
  if (!container) return;
  
  // Only render to DOM if this is the active tab (or if we're forcing a specific tab)
  const isActiveTab = targetTabId === s.activeTabId;
  const shouldRenderToDOM = forceTabId !== undefined || isActiveTab;
  
  if (!shouldRenderToDOM) {
    // Results stored in state, will be rendered when user switches to this tab
    return;
  }
  
  // Clear and reset
  container.innerHTML = '';
  invalidateRowCache();
  if (!skipClearFilters) clearAllFilters();

  // Validate results
  if (!payload || !payload.fieldOrder || !payload.rows || !payload.rows.length) {
    container.textContent = 'No results.';
    return;
  }

  // Build and render table using new builders
  const hidden = Array.isArray(payload.hiddenFields) ? payload.hiddenFields : ['@ptr'];
  const builder = new TableBuilder(payload, hidden);
  const table = builder.build();
  container.appendChild(table);

  // Bind events using event binder
  const eventBinder = new TableEventBinder(container);
  eventBinder.bindAll();

  // Update UI
  renderTabs();
  setStatus(`✓ Query Complete (${payload.rows.length} rows)`);
  initFiltersForNewResults();
  scheduleSearchRerun();
}

// Streaming append (partial results)
export function appendPartialResults(partial: QueryResults) {
  const s = getState();
  // Use runningQueryTabId if available (for background queries), otherwise activeTabId
  const targetTabId = s.runningQueryTabId ?? s.activeTabId;
  if (targetTabId == null) return;
  const tab = s.tabs.find(t => t.id === targetTabId);
  if (!tab) return;
  
  // Update state: merge partial results
  if (!tab.results || !tab.results.rows) {
    tab.results = { rows: [], fieldOrder: partial.fieldOrder || [], hiddenFields: partial.hiddenFields || ['@ptr'] };
  }
  const startIdx = tab.results.rows.length;
  tab.results.rows.push(...partial.rows);
  if (partial.fieldOrder && partial.fieldOrder.length) tab.results.fieldOrder = partial.fieldOrder;
  if (partial.hiddenFields) tab.results.hiddenFields = partial.hiddenFields;
  
  // Use state action to mark as streaming
  updateTab(s, targetTabId, { isStreaming: true });
  
  const container = getTabResultsContainer(targetTabId);
  if (!container) return;
  
  // Only render to DOM if this is the active tab
  const isActiveTab = targetTabId === s.activeTabId;
  if (!isActiveTab) {
    // Results stored in state, will be rendered when user switches to this tab
    return;
  }
  
  let table = container.querySelector('table') as HTMLTableElement | null;
  let tbody = table ? table.querySelector('tbody') as HTMLTableSectionElement | null : null;
  const hidden = Array.isArray(tab.results.hiddenFields) ? tab.results.hiddenFields : ['@ptr'];
  const fields = tab.results.fieldOrder.filter(f => !hidden.includes(f));
  
  if (!table) {
    // First batch - create table structure using builder
    invalidateRowCache();
    clearAllFilters();
    
    const builder = new TableBuilder(tab.results, hidden);
    table = builder.build();
    container.innerHTML = '';
    container.appendChild(table);
    
    // Bind events
    const eventBinder = new TableEventBinder(container);
    eventBinder.bindAll();
    
    tbody = table.querySelector('tbody') as HTMLTableSectionElement;
  } else {
    // Subsequent batches - append rows to existing tbody
    partial.rows.forEach((row, idx) => {
      const tr = document.createElement('tr') as HTMLTableRowElement;
      tr.dataset.rowIndex = String(startIdx + idx);
      
      const expandCell = document.createElement('td') as HTMLTableCellElement;
      expandCell.className = 'expand-cell';
      const expandBtn = document.createElement('button') as HTMLButtonElement;
      expandBtn.type = 'button'; 
      expandBtn.className = 'expand-btn'; 
      expandBtn.textContent = '›';
      expandCell.appendChild(expandBtn);
      tr.appendChild(expandCell);
      
      fields.forEach(f => {
        const val = row.fields.find(x => x.field === f)?.value || '';
        const td = document.createElement('td') as HTMLTableCellElement;
        td.textContent = val;
        td.dataset.field = f;
        tr.appendChild(td);
      });
      
      tbody?.appendChild(tr);
    });
  }
  
  // Update tab status using state action
  const statusMsg = `Streaming... (${tab.results.rows.length} rows)`;
  updateTab(s, targetTabId, { status: statusMsg });
  
  renderTabs();
  setStatus(statusMsg);
}
