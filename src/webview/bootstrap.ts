// Entry point that wires modules together. Built by esbuild into media/webview.js.
import { initMessageListener, send } from './core/messaging';
import { initTabsModel } from './features/tabs/model';
import { initTabsEvents } from './features/tabs/events';
import { renderTabs } from './features/tabs/render';
import { initQueryHandlers } from './core/queryHandlers';
import { clearAllFilters } from './features/results/filters';
import { initSearchEvents } from './features/search/search';
import { initQueryButtons } from './features/query/execution';
import { initTimeRangeUI } from './features/timeRange/timeRange';
import { initSavedQueriesUI } from './features/savedQueries/savedQueries';
import { initLogGroupsUI } from './features/logGroups/logGroups';
import { initQueryEditorUI } from './features/query/editor';
import { getState } from './core/state';

function init() {
  initMessageListener();
  initTabsModel();
  initTabsEvents();
  initQueryHandlers();
  initQueryButtons();
  initSearchEvents();
  initTimeRangeUI();
  initSavedQueriesUI();
  initLogGroupsUI();
  initQueryEditorUI();
  clearAllFilters();
  // Create initial results container for active tab
  const s = getState();
  if (s.activeTabId != null) {
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) {
      const div = document.createElement('div');
      div.id = `results-${s.activeTabId}`;
      div.className = 'results active';
      div.dataset.tabId = String(s.activeTabId);
      resultsContainer.appendChild(div);
    }
  }
  renderTabs();
  // Request initial data from extension
  try {
    send({ type: 'getSavedQueries' });
    send({ type: 'getFavorites' });
  } catch { /* ignore */ }
}

// Defer until DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
