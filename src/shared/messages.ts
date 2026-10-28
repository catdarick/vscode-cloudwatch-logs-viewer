// What the webview can ask the extension host, and what the host tells the webview on its own.
import type {
  AppSettings,
  LogGroupRef,
  PersistedState,
  RawFieldHistory,
  RegionResult,
  RunQueryParams,
} from './types';

export interface InitData {
  /** Undefined on the first start: the webview creates a fresh workspace. */
  state?: PersistedState;
  rawFields: RawFieldHistory;
  settings: AppSettings;
  /** Prefix of share links, e.g. vscode://catdarick.cloudwatch-logs-viewer/open?q= */
  linkBase: string;
  /** Search params of the share link the viewer was opened with, if any. */
  shared?: string;
}

/** Each method takes one params object and resolves with the result. */
export interface HostApi {
  init: (p: Record<string, never>) => InitData;
  saveState: (p: { state: PersistedState }) => void;
  saveRawFields: (p: { history: RawFieldHistory }) => void;
  listProfiles: (p: Record<string, never>) => string[];
  listLogGroups: (p: { profile?: string; region: string; prefix: string }) => LogGroupRef[];
  logGroupFields: (p: { profile?: string; group: LogGroupRef }) => string[];
  runQuery: (p: RunQueryParams) => RegionResult[];
  /** Stops the AWS queries of a request; its runQuery then rejects with `cancelled`. */
  cancelQuery: (p: { requestId: string }) => void;
  copy: (p: { text: string }) => void;
  /** Asks where to save and writes the file; false when the dialog was dismissed. */
  saveFile: (p: { filename: string; content: string }) => boolean;
  openSettings: (p: { query: string }) => void;
}

export type HostMethod = keyof HostApi;

export type HostEvent =
  | { type: 'openShared'; params: string }
  | { type: 'settings'; settings: AppSettings };

export interface SerializedError {
  message: string;
  /** AWS exception name, e.g. MalformedQueryException. */
  name?: string;
  cancelled?: boolean;
}

export type WebviewMessage = { kind: 'request'; id: number; method: HostMethod; params: unknown };

export type HostMessage =
  | { kind: 'response'; id: number; result?: unknown; error?: SerializedError }
  | { kind: 'event'; event: HostEvent };
