import { getState, createTab as createTabState, ensureFirstTab, switchToTab as switchStateTab, closeTab as closeStateTab } from '../../core/state';

export function getActiveTab() {
  const s = getState();
  return s.tabs.find(t => t.id === s.activeTabId) || null;
}

function createTabResultsContainer(tabId: number) {
  const container = document.getElementById('results-container');
  if (!container) return;
  
  const resultsDiv = document.createElement('div');
  resultsDiv.id = `results-${tabId}`;
  resultsDiv.className = 'results';
  resultsDiv.dataset.tabId = String(tabId);
  
  container.appendChild(resultsDiv);
}

export function createNewTab(name?: string) {
  const tab = createTabState(name);
  // Create DOM container for this tab's results
  createTabResultsContainer(tab.id);
  return tab;
}

export function switchToTab(id: number) {
  return switchStateTab(id);
}

export function closeTab(id: number) {
  closeStateTab(id);
}

export function initTabsModel() {
  ensureFirstTab();
}
