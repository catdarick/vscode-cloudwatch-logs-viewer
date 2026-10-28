import type { VirtualItem } from '@tanstack/react-virtual';

export type {
  AppSettings,
  ColumnSettings,
  LogGroupRef,
  PersistedState,
  QueryTab,
  SavedQuery,
  TimeRangeValue,
  TimeUnit,
} from '../shared/types';

export interface QueryResult {
  /** The query as the user wrote it (without what we prepend). */
  query: string;
  ranAt: number;
  durationMs: number;
  from: number;
  to: number;
  fields: string[];
  /** Fields holding epoch millis; formatted in the selected time zone when shown. */
  timeFields: string[];
  rows: Array<Record<string, string>>;
  /** Per row: the whole log event, which the query's own fields may not include. */
  details: LogDetails[];
  stats: QueryStats;
  error?: string;
}

export interface QueryStats {
  bytesScanned?: number;
  recordsScanned?: number;
  recordsMatched?: number;
}

export interface LogDetails {
  /** Raw @message; absent for stats queries or queries ending in display. */
  message?: string;
  logGroup?: string;
  logStream?: string;
  /** Epoch millis of @timestamp, which we add to every query. */
  timestamp?: number;
}

/**
 * How a tab's results table was left: filters, search, zoom, open rows and scroll. Kept in memory
 * (like results) so switching tabs and back shows the table as it was.
 */
export interface TableView {
  /** Allowed values per field. */
  filters: Record<string, Set<string>>;
  /** Time window picked on the histogram. */
  zoom?: { from: number; to: number };
  search: string;
  hideNonMatching: boolean;
  /** Index of the current search match. */
  current: number;
  /** Row indexes with details open. */
  expanded: Set<number>;
  /** Row indexes whose long cells are shown in full. */
  unclamped: Set<number>;
  scrollTop: number;
  scrollLeft: number;
  /** Measured row heights, so the scroll position lands on the same rows. */
  measurements?: VirtualItem[];
}
