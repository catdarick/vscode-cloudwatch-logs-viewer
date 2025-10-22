// Central mutable state container with narrow controlled update helpers.
// This file is an initial scaffold; integration with the existing webview.js will happen incrementally.

import { AppState, TabState, createInitialTab, createInitialAppState } from '../types/state';

// Re-export state actions as the primary mutation API
export {
  updateTab,
  resetTabForNewQuery,
  completeTabQuery,
  setTabError,
  setTabStatus,
  setTabName,
  setTabColumnFilters,
  clearTabColumnFilters,
  toggleRowExpanded,
  setExpandedRows,
  setTabScrollPosition,
  setFavorites,
  setSavedQueries,
  setLogGroups
} from './stateActions';

// Single instance (could be replaced with a class or proxy later)
const state: AppState = createInitialAppState();

// ---- Tab operations ----
export function ensureFirstTab(): TabState {
  if (state.tabs.length === 0) {
    const tab = createInitialTab(state.nextTabId++);
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    return tab;
  }
  return getActiveTab() || state.tabs[0];
}

export function createTab(name = 'Results'): TabState {
  const tab = createInitialTab(state.nextTabId++);
  tab.name = name;
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  return tab;
}

export function getActiveTab(): TabState | undefined {
  return state.tabs.find(t => t.id === state.activeTabId);
}

export function switchToTab(id: number): TabState | undefined {
  if (!state.tabs.some(t => t.id === id)) return undefined;
  state.activeTabId = id;
  return getActiveTab();
}

export function closeTab(id: number): void {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
  state.tabs.splice(idx, 1);
  if (state.activeTabId === id) {
    state.activeTabId = state.tabs.length ? state.tabs[Math.max(0, idx - 1)].id : null;
  }
}

// ---- Additional Selectors ----
export function getTabById(id: number): TabState | undefined {
  return state.tabs.find(t => t.id === id);
}

export function getAllTabs(): readonly TabState[] {
  return state.tabs;
}

export function getTabCount(): number {
  return state.tabs.length;
}

/**
 * Get the status message for a tab.
 */
export function getTabStatus(tabId: number): string {
  const tab = getTabById(tabId);
  return tab?.status ?? '';
}

// ---- Export raw state (read-only) ----
export function getState(): Readonly<AppState> {
  return state;
}
