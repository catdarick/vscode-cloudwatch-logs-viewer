/**
 * Centralized state mutation actions.
 * All state changes should go through these functions to ensure:
 * - Consistency in how state is updated
 * - Single source of truth for state transitions
 * - Easy tracking of state changes for debugging
 */

import { AppState } from '../types/state';
import { QueryResults, TimeRange } from '../types/domain';

// ---- Tab lifecycle actions ----

export interface UpdateTabOptions {
  name?: string;
  isCustomName?: boolean;
  query?: string;
  logGroups?: string[];
  region?: string;
  status?: string;
  isStreaming?: boolean;
  results?: QueryResults | null;
  searchQuery?: string;
  searchIndex?: number;
  searchHideNonMatching?: boolean;
  searchBarOpen?: boolean;
  scrollPosition?: number;
  timeRange?: TimeRange;
}

/**
 * Update one or more properties of a tab.
 * @returns true if tab was found and updated, false otherwise
 */
export function updateTab(
  state: AppState,
  tabId: number,
  updates: UpdateTabOptions
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  Object.assign(tab, updates);
  return true;
}

/**
 * Reset a tab to prepare for a new query execution.
 * This is an atomic operation that resets all query-related state.
 */
export function resetTabForNewQuery(
  state: AppState,
  tabId: number,
  query: string,
  logGroups: string[],
  region: string,
  timeRange: TimeRange
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  // Atomic reset - all changes together
  tab.query = query;
  tab.logGroups = logGroups;
  tab.region = region;
  tab.timeRange = timeRange;
  tab.results = null;
  tab.isStreaming = true;
  tab.searchQuery = '';
  tab.searchIndex = -1;
  tab.columnFilters = {};
  tab.expandedRows = new Set();
  tab.scrollPosition = 0;
  tab.status = 'Running query...';

  return true;
}

/**
 * Mark a tab's query as complete with results.
 */
export function completeTabQuery(
  state: AppState,
  tabId: number,
  results: QueryResults
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.results = results;
  tab.isStreaming = false;
  tab.status = `✓ Query Complete (${results.rows.length} rows)`;

  return true;
}

/**
 * Set a tab to error state.
 */
export function setTabError(
  state: AppState,
  tabId: number,
  error: string
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.status = `Error: ${error}`;
  tab.isStreaming = false;

  return true;
}

/**
 * Set a tab's streaming status and status message.
 */
export function setTabStatus(
  state: AppState,
  tabId: number,
  status: string,
  isStreaming?: boolean
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.status = status;
  if (isStreaming !== undefined) {
    tab.isStreaming = isStreaming;
  }

  return true;
}

/**
 * Update tab name (optionally marking it as custom).
 */
export function setTabName(
  state: AppState,
  tabId: number,
  name: string,
  isCustomName: boolean = true
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.name = name;
  tab.isCustomName = isCustomName;

  return true;
}

// ---- Column filters ----

/**
 * Set column filters for the active tab.
 */
export function setTabColumnFilters(
  state: AppState,
  tabId: number,
  columnFilters: Record<string, Set<string>>
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.columnFilters = columnFilters;
  return true;
}

/**
 * Clear all column filters for a tab.
 */
export function clearTabColumnFilters(
  state: AppState,
  tabId: number
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.columnFilters = {};
  return true;
}

// ---- Expanded rows ----

/**
 * Toggle a row's expanded state.
 */
export function toggleRowExpanded(
  state: AppState,
  tabId: number,
  rowIndex: number
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  if (tab.expandedRows.has(rowIndex)) {
    tab.expandedRows.delete(rowIndex);
  } else {
    tab.expandedRows.add(rowIndex);
  }

  return true;
}

/**
 * Set expanded rows for a tab.
 */
export function setExpandedRows(
  state: AppState,
  tabId: number,
  expandedRows: Set<number>
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.expandedRows = expandedRows;
  return true;
}

// ---- Scroll position ----

/**
 * Save scroll position for a tab.
 */
export function setTabScrollPosition(
  state: AppState,
  tabId: number,
  scrollPosition: number
): boolean {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return false;

  tab.scrollPosition = scrollPosition;
  return true;
}

// ---- Global state actions ----

/**
 * Set favorites list.
 */
export function setFavorites(state: AppState, favorites: any[]): void {
  state.favorites = favorites;
}

/**
 * Set saved queries list.
 */
export function setSavedQueries(state: AppState, savedQueries: any[], source: 'aws' | 'local'): void {
  state.savedQueries = savedQueries;
  state.savedQueriesSource = source;
}

/**
 * Set log groups list.
 */
export function setLogGroups(state: AppState, logGroups: string[]): void {
  state.logGroups = logGroups;
}
