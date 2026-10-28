import * as vscode from 'vscode';
import type { PersistedState, RawFieldHistory, SavedQuery } from '../shared/types';
import { listQueryDefinitions } from './aws';

const STATE_KEY = 'cloudwatchLogsViewer.workspace.v1';
const RAW_FIELDS_KEY = 'cloudwatchLogsViewer.rawFields.v1';

// Kept by versions before 0.4.
const LEGACY_FAVORITES_KEY = 'cloudwatchLogsViewer.favoriteLogGroups';
const LEGACY_SAVED_KEY = 'cloudwatchLogsViewer.savedQueries';
const LEGACY_LAST_QUERY_KEY = 'cloudwatchLogsViewer.lastQuery';

const DEFAULT_QUERY = 'fields @timestamp, @message\n| sort @timestamp desc\n| limit 100';

export function loadState(context: vscode.ExtensionContext): PersistedState | undefined {
  return context.globalState.get<PersistedState>(STATE_KEY);
}

export function saveState(context: vscode.ExtensionContext, state: PersistedState) {
  return context.globalState.update(STATE_KEY, state);
}

export function loadRawFields(context: vscode.ExtensionContext): RawFieldHistory {
  return context.globalState.get<RawFieldHistory>(RAW_FIELDS_KEY) ?? {};
}

export function saveRawFields(context: vscode.ExtensionContext, history: RawFieldHistory) {
  return context.globalState.update(RAW_FIELDS_KEY, history);
}

/**
 * The workspace of a version before 0.4, on the first start of this one: favorites, saved queries
 * (local ones, and the account's query definitions that version used) and the last query.
 * Undefined when that version was never used here.
 */
export async function migrateLegacyState(
  context: vscode.ExtensionContext,
  profile: string | undefined,
  region: string
): Promise<PersistedState | undefined> {
  const favorites = context.globalState.get<Array<{ name: string; region: string }>>(LEGACY_FAVORITES_KEY);
  const saved = context.globalState.get<Array<{ name: string; query: string }>>(LEGACY_SAVED_KEY);
  const lastQuery = context.globalState.get<string>(LEGACY_LAST_QUERY_KEY);
  if (favorites === undefined && saved === undefined && lastQuery === undefined) {
    return undefined;
  }
  const savedQueries = new Map<string, SavedQuery>();
  (saved ?? []).forEach((q) => q.name && q.query && savedQueries.set(q.name, { name: q.name, query: q.query }));
  try {
    const remote = await withTimeout(listQueryDefinitions(profile, region), 5000);
    remote.forEach((q) => savedQueries.has(q.name) || savedQueries.set(q.name, q));
  } catch {
    // No credentials or no permission: the local saved queries are all there is.
  }
  const tab = {
    id: Math.random().toString(36).slice(2, 10),
    title: 'Query 1',
    query: lastQuery?.trim() ? lastQuery : DEFAULT_QUERY,
    logGroups: [],
    timeRange: { mode: 'relative' as const, amount: 30, unit: 'minutes' as const },
  };
  return {
    tabs: [tab],
    activeTabId: tab.id,
    favorites: (favorites ?? []).filter((f) => f.name && f.region).map((f) => ({ name: f.name, region: f.region })),
    savedQueries: Array.from(savedQueries.values()).sort((a, b) => a.name.localeCompare(b.name)),
    timeZone: 'utc',
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}
