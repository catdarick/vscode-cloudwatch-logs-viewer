// Types shared by the extension host and the webview.

export type TimeUnit = 'minutes' | 'hours' | 'days';

export type TimeRangeValue =
  { mode: 'relative'; amount: number; unit: TimeUnit } | { mode: 'absolute'; from: number; to: number };

export interface LogGroupRef {
  name: string;
  region: string;
  arn?: string;
}

/** Table layout per tab, keyed by field name so it survives re-running the query. */
export interface ColumnSettings {
  /** Fields taken from the raw JSON log (@message) and shown as extra columns. */
  extra?: string[];
  order?: string[];
  hidden?: string[];
  widths?: Record<string, number>;
}

export interface QueryTab {
  id: string;
  title: string;
  query: string;
  logGroups: LogGroupRef[];
  timeRange: TimeRangeValue;
  savedQueryName?: string;
  columns?: ColumnSettings;
}

export interface SavedQuery {
  name: string;
  query: string;
}

/** Everything that survives a reload. Results are kept in memory only. */
export interface PersistedState {
  tabs: QueryTab[];
  activeTabId: string;
  favorites: LogGroupRef[];
  savedQueries: SavedQuery[];
  /** Time zone id: "utc", "browser" or an IANA name. */
  timeZone: string;
  /** AWS profile picked in the top bar; empty means the default credential chain. */
  profile?: string;
  /**
   * Scrolling the logs moves the query part out of view, so the table can take the whole window.
   * Off (default): the query stays on top and the table takes the space under it.
   */
  autoExpand?: boolean;
}

export interface AppSettings {
  /** Profile from the settings, used until one is picked in the viewer. */
  profile: string;
  defaultRegion: string;
  /** USD per GB scanned, for the cost estimate next to each result. */
  costPerGb: number;
}

/** Field names found in raw JSON logs, per log group ("region:name"). */
export type RawFieldHistory = Record<string, { runs: number; fields: Record<string, number> }>;

/** One field of one row, as GetQueryResults returns it. */
export interface ResultField {
  field: string;
  value: string;
}

export interface RegionResult {
  region: string;
  rows: ResultField[][];
  /** GetQueryResults statistics. */
  statistics?: { bytesScanned?: number; recordsScanned?: number; recordsMatched?: number };
}

export interface RunQueryParams {
  requestId: string;
  profile?: string;
  /** The query as sent to Logs Insights, with the fields we add. */
  query: string;
  /** Log group names per region; each region runs as its own query. */
  regions: Array<{ region: string; logGroupNames: string[] }>;
  /** Epoch millis. */
  from: number;
  to: number;
}
