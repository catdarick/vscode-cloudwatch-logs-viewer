import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '../host';
import { LogGroupRef, PersistedState, QueryTab, SavedQuery } from '../types';
import { SharedQuery, matchesTab } from '../utils/shareLink';
import { DEFAULT_TIME_RANGE } from '../utils/timeRange';

const DEFAULT_QUERY = 'fields @timestamp, @message\n| sort @timestamp desc\n| limit 100';

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createTab(index: number, from?: QueryTab): QueryTab {
  return {
    id: newId(),
    title: `Query ${index}`,
    query: from?.query ?? DEFAULT_QUERY,
    logGroups: from?.logGroups ?? [],
    timeRange: from?.timeRange ?? DEFAULT_TIME_RANGE,
    savedQueryName: from?.savedQueryName,
    columns: from?.columns,
  };
}

/** What the extension kept, checked the way a hand-edited or older copy may need. */
function initialState(stored: PersistedState | undefined, profile: string): PersistedState {
  if (stored && Array.isArray(stored.tabs) && stored.tabs.length > 0) {
    return {
      tabs: stored.tabs,
      activeTabId: stored.activeTabId ?? stored.tabs[0].id,
      favorites: stored.favorites ?? [],
      savedQueries: stored.savedQueries ?? [],
      timeZone: stored.timeZone ?? 'utc',
      profile: stored.profile ?? profile,
      autoExpand: stored.autoExpand,
    };
  }
  const tab = createTab(1);
  return { tabs: [tab], activeTabId: tab.id, favorites: [], savedQueries: [], timeZone: 'utc', profile };
}

/** Typing changes the state on every key; the extension gets it once typing pauses. */
const SAVE_DELAY = 300;

export const sameGroup = (a: LogGroupRef, b: LogGroupRef) => a.name === b.name && a.region === b.region;

export function useWorkspace(stored: PersistedState | undefined, defaultProfile: string) {
  const [state, setState] = useState<PersistedState>(() => initialState(stored, defaultProfile));

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => notify('saveState', { state }), SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [state]);
  // Whatever typing is still waiting goes out before the panel closes.
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => notify('saveState', { state: latest.current });
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];

  const updateTab = useCallback((id: string, patch: Partial<QueryTab>) => {
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }, []);

  const addTab = useCallback((duplicateOf?: QueryTab) => {
    setState((s) => {
      const tab = createTab(nextTabNumber(s.tabs), duplicateOf);
      return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id };
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setState((s) => {
      const index = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) {
        const tab = createTab(1);
        return { ...s, tabs: [tab], activeTabId: tab.id };
      }
      const activeTabId = s.activeTabId === id ? tabs[Math.max(0, index - 1)].id : s.activeTabId;
      return { ...s, tabs, activeTabId };
    });
  }, []);

  /** Opens a shared link: selects an identical tab if there is one, otherwise adds a new tab. */
  const openShared = useCallback((shared: SharedQuery) => {
    setState((s) => {
      const existing = s.tabs.find((t) => matchesTab(t, shared));
      if (existing) {
        return { ...s, activeTabId: existing.id };
      }
      const tab = {
        ...createTab(nextTabNumber(s.tabs)),
        query: shared.query,
        logGroups: shared.logGroups,
        timeRange: shared.timeRange,
      };
      return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id };
    });
  }, []);

  const selectTab = useCallback((id: string) => setState((s) => ({ ...s, activeTabId: id })), []);

  const toggleFavorite = useCallback((group: LogGroupRef) => {
    setState((s) => ({
      ...s,
      favorites: s.favorites.some((f) => sameGroup(f, group))
        ? s.favorites.filter((f) => !sameGroup(f, group))
        : [...s.favorites, group],
    }));
  }, []);

  const saveQuery = useCallback((query: SavedQuery) => {
    setState((s) => ({
      ...s,
      savedQueries: [...s.savedQueries.filter((q) => q.name !== query.name), query].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));
  }, []);

  const deleteQuery = useCallback((name: string) => {
    setState((s) => ({ ...s, savedQueries: s.savedQueries.filter((q) => q.name !== name) }));
  }, []);

  const setTimeZone = useCallback((timeZone: string) => setState((s) => ({ ...s, timeZone })), []);
  const setProfile = useCallback((profile: string) => setState((s) => ({ ...s, profile })), []);
  const setAutoExpand = useCallback((autoExpand: boolean) => setState((s) => ({ ...s, autoExpand })), []);

  return {
    state,
    activeTab,
    setTimeZone,
    setProfile,
    setAutoExpand,
    updateTab,
    addTab,
    closeTab,
    openShared,
    selectTab,
    toggleFavorite,
    saveQuery,
    deleteQuery,
  };
}

function nextTabNumber(tabs: QueryTab[]) {
  const numbers = tabs.map((t) => Number(/^Query (\d+)$/.exec(t.title)?.[1] ?? 0));
  return Math.max(0, ...numbers) + 1;
}
