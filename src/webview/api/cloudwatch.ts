import type { RegionResult } from '../../shared/types';
import { request } from '../host';
import { mentionsField, parseQuery, sortKeys } from '../language/parse';
import { unquoteField } from '../language/spec';
import type { Token } from '../language/tokenize';
import { LogDetails, LogGroupRef, QueryResult, QueryStats } from '../types';
import { sortOrder } from '../utils/table';

// Fields we add to every query, hidden from the table.
const INTERNAL_FIELD_SUFFIX = '__internal__';
const LOG_FIELD = '__log__internal__';
const LOG_STREAM_FIELD = '__logstream__internal__';
const MESSAGE_FIELD = '__message__internal__';
/** Logs Insights returns the event pointer with every row. */
const POINTER_FIELD = '@ptr';

/** Commands that keep every field of the stages before them: after them, @message is still there. */
const KEEPS_FIELDS = new Set(['fields', 'filter', 'filterindex', 'sort', 'limit', 'parse', 'dedup', 'unmask', 'where']);

/**
 * Whether the query's rows carry @message as it is: a `fields` command lists it bare (not renamed,
 * not inside a function), and every command keeps the fields of the ones before (no stats, display,
 * pattern...). Then asking for our own copy of it would only double what comes down.
 */
export function returnsMessage(query: string): boolean {
  const { stages } = parseQuery(query);
  if (stages.some((s) => !KEEPS_FIELDS.has(s.command?.name.toLowerCase() ?? ''))) {
    return false;
  }
  return stages.some((s) => s.command?.name === 'fields' && listsBare(s.args, '@message'));
}

/** Whether a comma-separated list names the field on its own, at the top level. */
function listsBare(args: Token[], field: string): boolean {
  let depth = 0;
  return args.some((t, i) => {
    if (t.type === 'open') {
      depth++;
    } else if (t.type === 'close') {
      depth = Math.max(0, depth - 1);
    }
    const prev = args[i - 1];
    const next = args[i + 1];
    return (
      depth === 0 &&
      t.type === 'word' &&
      unquoteField(t.text) === field &&
      (!prev || prev.type === 'comma') &&
      (!next || next.type === 'comma')
    );
  });
}

/**
 * Asks for the timestamp, the raw @message, its log group and stream alongside whatever the query
 * selects, so an expanded row can show the whole log event. Logs Insights keeps fields from every
 * `fields` command. @message is left out when the query returns it anyway. @log and @logStream go
 * through ltrim, or a later unaliased use of them in the query would be rejected (Grafana's
 * CloudWatch backend does the same).
 *
 * It goes on the query's first line, so CloudWatch's error positions on the other lines match.
 */
export function queryPrefix(query: string): string {
  const message = returnsMessage(query) ? '' : `@message as ${MESSAGE_FIELD}, `;
  return `fields @timestamp, ${message}ltrim(@log) as ${LOG_FIELD}, ltrim(@logStream) as ${LOG_STREAM_FIELD} | `;
}

export function withMessageField(query: string): string {
  return queryPrefix(query) + query;
}

/** Points CloudWatch's error positions on the first line at the query as written, without the prefix. */
export function fixErrorPosition(message: string, prefixLength: number): string {
  return message.replace(
    /\bline (\d+)( and |, ?)(position|column|col) (\d+)/gi,
    (all, line: string, sep: string, word: string, position: string) =>
      Number(line) === 1 && Number(position) >= prefixLength
        ? `line 1${sep}${word} ${Number(position) - prefixLength}`
        : all
  );
}

/** Lists up to 50 log groups with the name prefix. */
export function fetchLogGroups(profile: string | undefined, region: string, prefix: string): Promise<LogGroupRef[]> {
  return request('listLogGroups', { profile, region, prefix });
}

/** Field names CloudWatch discovered in a log group over the last 15 minutes. */
export function fetchLogGroupFields(profile: string | undefined, group: LogGroupRef): Promise<string[]> {
  return request('logGroupFields', { profile, group });
}

export interface RunQueryArgs {
  profile?: string;
  requestId: string;
  query: string;
  logGroups: LogGroupRef[];
  from: number;
  to: number;
}

/**
 * Runs a Logs Insights query in AWS: the extension calls StartQuery and polls GetQueryResults until
 * the query finishes. Log groups from different regions run as separate queries and are merged.
 */
export async function runLogsQuery(args: RunQueryArgs): Promise<QueryResult> {
  const startedAt = Date.now();
  const byRegion = groupByRegion(args.logGroups);
  let regions: RegionResult[];
  try {
    regions = await request('runQuery', {
      requestId: args.requestId,
      profile: args.profile,
      query: withMessageField(args.query),
      regions: Array.from(byRegion, ([region, groups]) => ({ region, logGroupNames: groups.map((g) => g.name) })),
      from: args.from,
      to: args.to,
    });
  } catch (e) {
    if (e instanceof Error && !(e as { cancelled?: boolean }).cancelled) {
      e.message = fixErrorPosition(e.message, queryPrefix(args.query).length);
    }
    throw e;
  }
  const result = applyQuerySort(resultsToRows(regions, args.query), args.query);
  return {
    ...result,
    query: args.query,
    ranAt: startedAt,
    durationMs: Date.now() - startedAt,
    from: args.from,
    to: args.to,
  };
}

/**
 * The query with CloudWatch's `estimate` at the end: it answers how many bytes the query would scan,
 * without scanning (and without a charge). A query that already ends with it is left as it is.
 */
export function estimateQueryString(query: string): string {
  const { stages } = parseQuery(query);
  return stages[stages.length - 1]?.command?.name === 'estimate' ? query : `${query}\n| estimate`;
}

/** The field CloudWatch answers an `estimate` with. */
const ESTIMATE_FIELD = '@estimatedBytesScanned';

/** Bytes the query would scan in its log groups and range, summed over regions. */
export async function estimateScan(args: RunQueryArgs): Promise<number> {
  const regions = await request('runQuery', {
    requestId: args.requestId,
    profile: args.profile,
    query: estimateQueryString(args.query),
    regions: Array.from(groupByRegion(args.logGroups), ([region, groups]) => ({
      region,
      logGroupNames: groups.map((g) => g.name),
    })),
    from: args.from,
    to: args.to,
  });
  return sumEstimates(regions);
}

export function sumEstimates(regions: RegionResult[]): number {
  let total: number | undefined;
  for (const field of regions.flatMap((r) => r.rows.flat())) {
    if (field.field === ESTIMATE_FIELD && Number.isFinite(Number(field.value))) {
      total = (total ?? 0) + Number(field.value);
    }
  }
  if (total === undefined) {
    throw new Error('CloudWatch did not return an estimate');
  }
  return total;
}

/** Aborts the run; the extension stops the query in AWS too. */
export function cancelQuery(requestId: string) {
  request('cancelQuery', { requestId }).catch(() => undefined);
}

function groupByRegion(groups: LogGroupRef[]): Map<string, LogGroupRef[]> {
  const map = new Map<string, LogGroupRef[]>();
  for (const g of groups) {
    const region = g.region || 'us-east-1';
    map.set(region, [...(map.get(region) ?? []), g]);
  }
  return map;
}

/** "2026-10-08 22:59:45.123", the way Logs Insights returns @timestamp and bin(): UTC. */
const CLOUDWATCH_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;

function parseCloudWatchTime(value: string): number | undefined {
  if (!CLOUDWATCH_TIME.test(value)) {
    return undefined;
  }
  const ms = Date.parse(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

const isInternal = (name: string) => name.endsWith(INTERNAL_FIELD_SUFFIX) || name === POINTER_FIELD;

/**
 * Rows of every region's results. A field is a time field when its first value reads as a
 * CloudWatch time (as Grafana types frame fields); its values become epoch millis.
 */
export function resultsToRows(
  regions: RegionResult[],
  query: string
): Pick<QueryResult, 'fields' | 'timeFields' | 'rows' | 'details' | 'stats'> {
  // We add @timestamp to every query; hide it unless the query asks for it.
  const showTimestamp = mentionsField(query, '@timestamp');
  const fields: string[] = [];
  const firstValue = new Map<string, string>();
  const raw: Array<Map<string, string>> = [];
  const stats: QueryStats = {};

  for (const region of regions) {
    for (const [key, value] of Object.entries(region.statistics ?? {})) {
      if (typeof value === 'number') {
        stats[key as keyof QueryStats] = (stats[key as keyof QueryStats] ?? 0) + value;
      }
    }
    for (const row of region.rows) {
      const values = new Map<string, string>();
      for (const { field, value } of row) {
        if (!field) {
          continue;
        }
        values.set(field, value);
        if (value !== '' && !firstValue.has(field)) {
          firstValue.set(field, value);
        }
        if (!isInternal(field) && (showTimestamp || field !== '@timestamp') && !fields.includes(field)) {
          fields.push(field);
        }
      }
      raw.push(values);
    }
  }

  const timeFields = fields.filter((f) => {
    const first = firstValue.get(f);
    return first !== undefined && parseCloudWatchTime(first) !== undefined;
  });
  const rows: Array<Record<string, string>> = [];
  const details: LogDetails[] = [];
  for (const values of raw) {
    const row: Record<string, string> = {};
    for (const f of fields) {
      const value = values.get(f);
      if (value === undefined || value === '') {
        continue;
      }
      if (timeFields.includes(f)) {
        const ms = parseCloudWatchTime(value);
        if (ms !== undefined) {
          row[f] = String(ms);
        }
      } else {
        row[f] = value;
      }
    }
    rows.push(row);
    const timestamp = values.get('@timestamp');
    details.push({
      // Our copy, or the query's own @message when it returns it (then we do not ask for a copy).
      message: nonEmpty(values.get(MESSAGE_FIELD) ?? values.get('@message')),
      logGroup: nonEmpty(values.get(LOG_FIELD)),
      logStream: nonEmpty(values.get(LOG_STREAM_FIELD)),
      timestamp: timestamp ? parseCloudWatchTime(timestamp) : undefined,
    });
  }
  return { fields, timeFields, rows, details, stats };
}

/**
 * Rows from several regions arrive one region after another. Re-apply the query's sort to the
 * merged rows (each region's rows already follow it).
 */
export function applyQuerySort<T extends Pick<QueryResult, 'rows' | 'details'>>(result: T, query: string): T {
  const keys = sortKeys(query);
  if (keys.length === 0) {
    return result;
  }
  const order = sortOrder(result.rows.length, keys, (i, field) =>
    field === '@timestamp' ? result.details[i]?.timestamp : result.rows[i][field]
  );
  return { ...result, rows: order.map((i) => result.rows[i]), details: order.map((i) => result.details[i]) };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
