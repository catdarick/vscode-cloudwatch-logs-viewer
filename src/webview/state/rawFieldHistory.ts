import { useCallback, useRef, useState } from 'react';
import type { RawFieldHistory } from '../../shared/types';
import { notify } from '../host';
import { LogDetails, LogGroupRef } from '../types';
import { flattenMessage } from '../utils/table';

/** How many of a group's latest queries its raw log fields are remembered from. */
export const RAW_FIELD_RUNS = 20;
/** Per group, so a log with ever-changing keys cannot fill up storage. */
const MAX_FIELDS = 1000;

// Per group: `runs` counts queries that returned rows from it, `fields` maps a field name to the
// number of the last of them it was seen in.
export type { RawFieldHistory };

export const groupKey = (g: LogGroupRef) => `${g.region}:${g.name}`;

/**
 * Field names of the raw JSON log events in a result, per queried group. A group is listed when
 * it returned at least one row with a message, even if none was JSON, so its old fields age out.
 */
export function rawFieldsByGroup(groups: LogGroupRef[], details: LogDetails[]): Map<string, Set<string>> {
  const seen = new Map<string, Set<string>>();
  for (const d of details) {
    if (d.message === undefined) {
      continue;
    }
    // @log is "account:name"; a group of the same name in two regions gets the fields of both.
    const owners = d.logGroup
      ? groups.filter((g) => d.logGroup === g.name || d.logGroup!.endsWith(`:${g.name}`))
      : groups.length === 1
        ? groups
        : [];
    if (owners.length === 0) {
      continue;
    }
    const names = Object.keys(flattenMessage(d.message));
    for (const g of owners) {
      const key = groupKey(g);
      const set = seen.get(key) ?? new Set<string>();
      names.forEach((n) => set.add(n));
      seen.set(key, set);
    }
  }
  return seen;
}

/** Counts one more query for each group in `seen` and forgets fields not seen in its last RAW_FIELD_RUNS. */
export function recordRun(history: RawFieldHistory, seen: Map<string, Set<string>>): RawFieldHistory {
  const next = { ...history };
  for (const [key, names] of seen) {
    const runs = (history[key]?.runs ?? 0) + 1;
    let entries = Object.entries(history[key]?.fields ?? {}).filter(([, last]) => last > runs - RAW_FIELD_RUNS);
    const fields: Record<string, number> = Object.fromEntries(entries);
    names.forEach((n) => (fields[n] = runs));
    entries = Object.entries(fields);
    next[key] = {
      runs,
      fields:
        entries.length > MAX_FIELDS
          ? Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_FIELDS))
          : fields,
    };
  }
  return next;
}

/** Remembered raw log fields of the given groups, sorted. */
export function knownRawFields(history: RawFieldHistory, groups: LogGroupRef[]): string[] {
  const names = new Set<string>();
  groups.forEach((g) => Object.keys(history[groupKey(g)]?.fields ?? {}).forEach((n) => names.add(n)));
  return Array.from(names).sort();
}

/** Raw log fields per group, kept by the extension apart from the workspace. */
export function useRawFieldHistory(initial: RawFieldHistory) {
  const [history, setHistory] = useState(initial);
  const latest = useRef(history);
  const record = useCallback((groups: LogGroupRef[], details: LogDetails[]) => {
    const seen = rawFieldsByGroup(groups, details);
    if (seen.size === 0) {
      return;
    }
    const next = recordRun(latest.current, seen);
    latest.current = next;
    notify('saveRawFields', { history: next });
    setHistory(next);
  }, []);
  return { history, record };
}
