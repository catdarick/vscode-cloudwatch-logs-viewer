// Application-level state types for the webview.
// Represents the entire UI state tree.

import { QueryResults, TimeRange, TimeMode, RelativeTimeSpec } from './domain';
import { Favorite } from '../features/favorites/types';
import { SavedQuery } from '../features/savedQueries/types';

// DOM-based search cache entry (stored per-tab, not serializable)
export interface DomRowCacheEntry {
  rowEl: HTMLTableRowElement;
  cells: { el: HTMLTableCellElement; original: string; lower: string }[];
  combinedLower: string;
  lastMatched: boolean;
}

// Search match reference (stored per-tab, not serializable)
export interface SearchMatch {
  row: HTMLTableRowElement;
  mark: HTMLElement;
}

export interface TabState {
  id: number;
  name: string;
  isCustomName: boolean;
  timestamp: number;            // creation time
  query: string;                // raw query text
  logGroups: string[];          // selected log groups at execution time
  region: string;               // AWS region
  timeRange: TimeRange;         // stored execution range
  results: QueryResults | null; // last results (may be partial while streaming)
  searchQuery: string;          // last search term in this tab
  searchIndex: number;          // current match index
  searchHideNonMatching: boolean; // hide rows that don't match search
  searchBarOpen: boolean;       // whether the floating search bar is open for this tab
  rowCache?: DomRowCacheEntry[]; // DOM-based search cache (transient, not serializable)
  searchMatches?: SearchMatch[]; // Current search matches (transient, not serializable)
  previousMatchedRowIndices?: number[]; // Search optimization: previous matched row indices (transient)
  columnFilters: Record<string, Set<string>>; // per-column selected values
  expandedRows: Set<number>;    // row indices expanded for detail view
  scrollPosition: number;       // vertical scroll offset in results container
  isStreaming: boolean;         // query still receiving partial batches
  status: string;               // status message snapshot
}

export interface AppState {
  tabs: TabState[];
  activeTabId: number | null;
  runningQueryTabId: number | null; // which tab currently owns streaming query
  nextTabId: number;
  favorites: Favorite[];
  savedQueries: SavedQuery[];
  savedQueriesSource: 'aws' | 'local';
  logGroups: string[];            // currently loaded log groups list
  timeMode: TimeMode;
  relative: RelativeTimeSpec;
  absolute?: TimeRange;           // defined only when mode === 'absolute'
}

// Factory functions for creating initial state
export function createInitialTab(id: number): TabState {
  return {
    id,
    name: 'Results',
    isCustomName: false,
    timestamp: Date.now(),
    query: '',
    logGroups: [],
    region: '',
    timeRange: { start: 0, end: 0 },
    results: null,
    searchQuery: '',
    searchIndex: -1,
    searchHideNonMatching: false,
    searchBarOpen: false,
    columnFilters: {},
    expandedRows: new Set<number>(),
    scrollPosition: 0,
    isStreaming: false,
    status: ''
  };
}

export function createInitialAppState(): AppState {
  return {
    tabs: [],
    activeTabId: null,
    runningQueryTabId: null,
    nextTabId: 1,
    favorites: [],
    savedQueries: [],
    savedQueriesSource: 'aws',
    logGroups: [],
    timeMode: 'relative',
    relative: { value: 1, unit: 'hours' }
  };
}
