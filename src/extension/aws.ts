import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeQueriesCommand,
  DescribeQueryDefinitionsCommand,
  GetLogGroupFieldsCommand,
  GetQueryResultsCommand,
  QueryStatus,
  StartQueryCommand,
  StopQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import type { LogGroupRef, RegionResult, RunQueryParams, SavedQuery } from '../shared/types';
import { acceptGzip } from './gzip';

/** Where queries say what each step took: the "CloudWatch Logs" output channel. */
export interface QueryLog {
  info(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

let log: QueryLog = { info: () => undefined, warn: () => undefined, debug: () => undefined };

export function setLog(target: QueryLog) {
  log = target;
}

const clients = new Map<string, CloudWatchLogsClient>();

/** One client per profile and region; the SDK resolves and refreshes credentials inside it. */
function client(profile: string | undefined, region: string): CloudWatchLogsClient {
  const key = `${profile ?? ''}\n${region}`;
  let c = clients.get(key);
  if (!c) {
    c = new CloudWatchLogsClient({ region, ...(profile ? { profile } : {}) });
    acceptGzip(c, (t) => {
      if (t.command === 'GetQueryResultsCommand') {
        const unpacked = t.gzip ? `gzip, ${formatBytes(t.bytes)} unpacked` : 'not compressed';
        log.info(`  ${region}: GetQueryResults sent ${formatBytes(t.wireBytes)} (${unpacked})`);
      }
    });
    clients.set(key, c);
  }
  return c;
}

/**
 * Forgets clients after a credentials error, so the next call reads the profile again (say, after
 * `aws sso login`) instead of a provider that already gave up.
 */
function dropClientsOnCredentialsError(err: unknown) {
  const name = (err as { name?: string })?.name ?? '';
  if (/Credential|Token|Expired|SSO|UnrecognizedClient|InvalidSignature/i.test(name)) {
    clients.clear();
  }
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    dropClientsOnCredentialsError(err);
    throw err;
  }
}

/** Profiles from the shared config and credentials files, sorted. */
export function listProfiles(): string[] {
  const names = new Set<string>();
  const read = (path: string, isConfig: boolean) => {
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      return;
    }
    for (const match of text.matchAll(/^\s*\[([^\]]+)\]\s*$/gm)) {
      const section = match[1].trim();
      if (!isConfig) {
        names.add(section);
      } else if (section === 'default') {
        names.add('default');
      } else if (section.startsWith('profile ')) {
        names.add(section.slice('profile '.length).trim());
      }
    }
  };
  read(process.env.AWS_CONFIG_FILE || join(homedir(), '.aws', 'config'), true);
  read(process.env.AWS_SHARED_CREDENTIALS_FILE || join(homedir(), '.aws', 'credentials'), false);
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/** Up to 50 log groups whose names start with the prefix. */
export async function listLogGroups(profile: string | undefined, region: string, prefix: string): Promise<LogGroupRef[]> {
  const response = await call(() =>
    client(profile, region).send(
      new DescribeLogGroupsCommand({ limit: 50, logGroupNamePrefix: prefix.trim() || undefined })
    )
  );
  return (response.logGroups ?? []).flatMap((g) =>
    g.logGroupName ? [{ name: g.logGroupName, region, arn: g.arn }] : []
  );
}

/** Field names CloudWatch discovered in a log group over the last 15 minutes. */
export async function logGroupFields(profile: string | undefined, group: LogGroupRef): Promise<string[]> {
  const response = await call(() =>
    client(profile, group.region).send(new GetLogGroupFieldsCommand({ logGroupName: group.name }))
  );
  return (response.logGroupFields ?? []).flatMap((f) => (f.name ? [f.name] : []));
}

/** Saved queries of the account in a region (Logs Insights query definitions). */
export async function listQueryDefinitions(profile: string | undefined, region: string): Promise<SavedQuery[]> {
  const out: SavedQuery[] = [];
  let nextToken: string | undefined;
  do {
    const response = await call(() =>
      client(profile, region).send(new DescribeQueryDefinitionsCommand({ maxResults: 1000, nextToken }))
    );
    for (const d of response.queryDefinitions ?? []) {
      if (d.name && d.queryString) {
        out.push({ name: d.name, query: d.queryString });
      }
    }
    nextToken = response.nextToken;
  } while (nextToken && out.length < 5000);
  return out;
}

export class QueryCancelled extends Error {
  readonly cancelled = true;
  constructor() {
    super('Query cancelled');
    this.name = 'QueryCancelled';
  }
}

type StopReason = 'user' | 'timeout' | 'failed';

const running = new Map<string, (reason: StopReason) => void>();

/** Stops every region's query of a request in AWS; its runQuery then rejects with QueryCancelled. */
export function cancelQuery(requestId: string) {
  running.get(requestId)?.('user');
}

const TERMINAL: string[] = [QueryStatus.Complete, QueryStatus.Failed, QueryStatus.Cancelled, QueryStatus.Timeout];

/**
 * Whether DescribeQueries lists the query among the log group's running ones. It answers with
 * statuses only, while GetQueryResults carries every row found so far: checking with it on every
 * poll downloads those rows again and again, which from a laptop is what makes a query slow.
 */
async function listedAsRunning(c: CloudWatchLogsClient, queryId: string, logGroupName: string, signal: AbortSignal) {
  const response = await call(() =>
    c.send(new DescribeQueriesCommand({ logGroupName, status: QueryStatus.Running, maxResults: 100 }), {
      abortSignal: signal,
    })
  );
  return (response.queries ?? []).some((q) => q.queryId === queryId);
}

/**
 * Runs a Logs Insights query: StartQuery in each region, waits for it to finish, then fetches the
 * results once with GetQueryResults. Cancelling (or running the same request again) calls
 * StopQuery, so AWS stops scanning too.
 */
export async function runQuery(params: RunQueryParams, timeoutMs: number): Promise<RegionResult[]> {
  cancelQuery(params.requestId);
  const runStarted = Date.now();
  log.info(
    `Query ${shortId(params.requestId)}: ${new Date(params.from).toISOString()} → ${new Date(params.to).toISOString()}, ` +
      params.regions.map((r) => `${r.region}: ${r.logGroupNames.join(', ')}`).join('; ')
  );
  log.debug(params.query);
  const abort = new AbortController();
  const started: Array<{ region: string; queryId: string }> = [];
  let stopReason: StopReason | undefined;
  const stopStarted = () => {
    for (const q of started.splice(0)) {
      client(params.profile, q.region)
        .send(new StopQueryCommand({ queryId: q.queryId }))
        .catch(() => undefined);
    }
  };
  const stop = (reason: StopReason) => {
    if (stopReason) {
      return;
    }
    stopReason = reason;
    abort.abort();
    stopStarted();
  };
  running.set(params.requestId, stop);
  const timer = setTimeout(() => stop('timeout'), timeoutMs);

  const runRegion = async (region: string, logGroupNames: string[]): Promise<RegionResult> => {
    const c = client(params.profile, region);
    const startedAt = Date.now();
    const { queryId } = await call(() =>
      c.send(
        new StartQueryCommand({
          logGroupNames,
          queryString: params.query,
          startTime: Math.floor(params.from / 1000),
          endTime: Math.floor(params.to / 1000),
        }),
        { abortSignal: abort.signal }
      )
    );
    if (!queryId) {
      throw new Error('CloudWatch did not return a query id');
    }
    started.push({ region, queryId });
    if (stopReason) {
      // Stopped while StartQuery was on its way.
      stopStarted();
      throw new QueryCancelled();
    }
    log.info(`  ${region}: started ${queryId} in ${seconds(Date.now() - startedAt)}`);
    // Wait with DescribeQueries; without logs:DescribeQueries, or when it does not list the query,
    // GetQueryResults is all there is.
    let describe = true;
    let unlisted = 0;
    for (let attempt = 1; ; attempt++) {
      await sleep(Math.min(1000, 150 + attempt * 150), abort.signal);
      if (describe) {
        try {
          if (await listedAsRunning(c, queryId, logGroupNames[0], abort.signal)) {
            continue;
          }
        } catch (err) {
          if (abort.signal.aborted) {
            throw err;
          }
          describe = false;
          log.warn(
            `  ${region}: cannot check the status with DescribeQueries (${(err as Error).message}). ` +
              'Every check now downloads the rows found so far, which is slow; allow logs:DescribeQueries to avoid it.'
          );
        }
      }
      const fetchStarted = Date.now();
      const response = await call(() => c.send(new GetQueryResultsCommand({ queryId }), { abortSignal: abort.signal }));
      const status = response.status ?? QueryStatus.Unknown;
      if (!TERMINAL.includes(status)) {
        // Still scheduled, or running though DescribeQueries did not list it (twice: stop asking it).
        if (status === QueryStatus.Running && describe && ++unlisted >= 2) {
          describe = false;
          log.warn(`  ${region}: DescribeQueries does not list the running query; checking with GetQueryResults`);
        }
        continue;
      }
      const index = started.findIndex((q) => q.queryId === queryId);
      if (index >= 0) {
        started.splice(index, 1);
      }
      if (status !== QueryStatus.Complete) {
        throw new Error(`The query ${status === QueryStatus.Timeout ? 'timed out' : status.toLowerCase()} in ${region}`);
      }
      const rows = (response.results ?? []).map((row) =>
        row.map((f) => ({ field: f.field ?? '', value: f.value ?? '' }))
      );
      log.info(
        `  ${region}: complete after ${seconds(fetchStarted - startedAt)} (${attempt} checks); ` +
          `downloaded ${rows.length} rows in ${seconds(Date.now() - fetchStarted)}`
      );
      return {
        region,
        rows,
        statistics: {
          bytesScanned: response.statistics?.bytesScanned,
          recordsScanned: response.statistics?.recordsScanned,
          recordsMatched: response.statistics?.recordsMatched,
        },
      };
    }
  };

  const id = shortId(params.requestId);
  try {
    const results = await Promise.all(params.regions.map((r) => runRegion(r.region, r.logGroupNames)));
    log.info(`Query ${id}: done in ${seconds(Date.now() - runStarted)}`);
    return results;
  } catch (err) {
    // One region failing stops the others: their rows alone would look like the whole answer.
    stop('failed');
    const after = seconds(Date.now() - runStarted);
    if (stopReason === 'user') {
      log.info(`Query ${id}: cancelled after ${after}`);
      throw new QueryCancelled();
    }
    if (stopReason === 'timeout') {
      log.warn(`Query ${id}: stopped by the timeout after ${after}`);
      throw new Error(
        `Stopped the query after ${formatDuration(timeoutMs)} (setting cloudwatchLogsViewer.queryTimeoutMs)`
      );
    }
    log.warn(`Query ${id}: failed after ${after}: ${(err as Error)?.message ?? err}`);
    throw err;
  } finally {
    clearTimeout(timer);
    if (running.get(params.requestId) === stop) {
      running.delete(params.requestId);
    }
  }
}

/** The tab's part of a request id: enough to tell runs of different tabs apart in the log. */
function shortId(requestId: string): string {
  return requestId.replace(/^cloudwatch-logs-/, '');
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  const minutes = ms / 60000;
  return minutes >= 1 ? `${Math.round(minutes)} min` : `${Math.round(ms / 1000)} s`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new QueryCancelled());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new QueryCancelled());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
