/**
 * Results table rendering coordinator.
 * Simplified using extracted builders and event binders.
 */
import { QueryResults } from '../../types/domain';
import { getState, completeTabQuery } from '../../core/state';
import { renderTabs } from '../tabs/render';
import { notifyInfo } from '../../components/status';
import { scheduleSearchRerun, invalidateRowCache } from '../search/search';
import { clearAllFilters, initFiltersForNewResults } from './filters';
import { TableBuilder } from './builders/TableBuilder';
import { TableEventBinder } from './builders/EventBinder';

function getTabResultsContainer(tabId: number): HTMLElement | null {
  return document.getElementById(`results-${tabId}`);
}

export function renderResults(payload: QueryResults, skipClearFilters = false, forceTabId?: number) {
  const s = getState();
  // Use forceTabId if provided (for tab switching), otherwise use activeTabId
  const targetTabId = forceTabId ?? s.activeTabId;
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
  notifyInfo(`Query complete (${payload.rows.length} rows)`);
  initFiltersForNewResults();
  scheduleSearchRerun();
}
