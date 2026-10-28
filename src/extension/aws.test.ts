import { beforeEach, describe, expect, it, vi } from 'vitest';

// A CloudWatch Logs client whose answers each test scripts through `handle`.
const sdk = vi.hoisted(() => {
  const calls: Array<{ command: string; input: Record<string, unknown>; region: string }> = [];
  let handle: (command: string, input: Record<string, unknown>, region: string) => unknown = () => ({});
  const command = (name: string) =>
    class {
      readonly name = name;
      constructor(readonly input: Record<string, unknown>) {}
    };
  return {
    calls,
    setHandler: (fn: typeof handle) => (handle = fn),
    module: {
      QueryStatus: { Complete: 'Complete', Failed: 'Failed', Cancelled: 'Cancelled', Timeout: 'Timeout', Running: 'Running', Unknown: 'Unknown' },
      StartQueryCommand: command('StartQuery'),
      GetQueryResultsCommand: command('GetQueryResults'),
      StopQueryCommand: command('StopQuery'),
      DescribeQueriesCommand: command('DescribeQueries'),
      DescribeLogGroupsCommand: command('DescribeLogGroups'),
      GetLogGroupFieldsCommand: command('GetLogGroupFields'),
      DescribeQueryDefinitionsCommand: command('DescribeQueryDefinitions'),
      CloudWatchLogsClient: class {
        readonly middlewareStack = { add: () => undefined };
        constructor(readonly config: { region: string }) {}
        async send(cmd: { name: string; input: Record<string, unknown> }, options?: { abortSignal?: AbortSignal }) {
          calls.push({ command: cmd.name, input: cmd.input, region: this.config.region });
          if (options?.abortSignal?.aborted) {
            throw Object.assign(new Error('aborted'), { name: 'AbortError' });
          }
          return handle(cmd.name, cmd.input, this.config.region);
        }
      },
    },
  };
});

vi.mock('@aws-sdk/client-cloudwatch-logs', () => sdk.module);

const { runQuery, cancelQuery, listLogGroups, setLog } = await import('./aws');

const count = (command: string) => sdk.calls.filter((c) => c.command === command).length;

const params = (regions: string[]) => ({
  requestId: 'tab-1',
  query: 'fields @message',
  regions: regions.map((region) => ({ region, logGroupNames: ['/app'] })),
  from: 1_700_000_000_500,
  to: 1_700_000_600_900,
});

beforeEach(() => {
  sdk.calls.length = 0;
});

describe('runQuery', () => {
  it('starts the query in seconds and polls until it completes', async () => {
    let polls = 0;
    sdk.setHandler((command) => {
      if (command === 'StartQuery') {
        return { queryId: 'q1' };
      }
      if (command === 'DescribeQueries') {
        return { queries: [] };
      }
      polls++;
      return polls < 2
        ? { status: 'Running' }
        : {
            status: 'Complete',
            results: [[{ field: 'msg', value: 'hi' }]],
            statistics: { bytesScanned: 10, recordsMatched: 1 },
          };
    });
    const result = await runQuery(params(['us-east-2']), 60_000);
    expect(sdk.calls[0].input).toMatchObject({ startTime: 1_700_000_000, endTime: 1_700_000_600 });
    expect(result).toEqual([
      {
        region: 'us-east-2',
        rows: [[{ field: 'msg', value: 'hi' }]],
        statistics: { bytesScanned: 10, recordsScanned: undefined, recordsMatched: 1 },
      },
    ]);
    expect(sdk.calls.some((c) => c.command === 'StopQuery')).toBe(false);
  });

  it('waits with DescribeQueries and downloads the results once', async () => {
    let checks = 0;
    sdk.setHandler((command) => {
      if (command === 'StartQuery') {
        return { queryId: 'q7' };
      }
      if (command === 'DescribeQueries') {
        checks++;
        return { queries: checks < 3 ? [{ queryId: 'other' }, { queryId: 'q7', status: 'Running' }] : [] };
      }
      return { status: 'Complete', results: [[{ field: 'msg', value: 'hi' }]] };
    });
    const lines: string[] = [];
    setLog({ info: (m: string) => lines.push(m), warn: (m: string) => lines.push(m), debug: () => undefined });
    const result = await runQuery(params(['us-east-2']), 60_000);
    expect(result[0].rows).toHaveLength(1);
    expect(count('DescribeQueries')).toBe(3);
    expect(count('GetQueryResults')).toBe(1);
    expect(sdk.calls.find((c) => c.command === 'DescribeQueries')?.input).toEqual({
      logGroupName: '/app',
      status: 'Running',
      maxResults: 100,
    });
    expect(lines.join('\n')).toMatch(/us-east-2: complete after .* \(3 checks\); downloaded 1 rows/);
  });

  it('checks with GetQueryResults when DescribeQueries is not allowed', async () => {
    let polls = 0;
    sdk.setHandler((command) => {
      if (command === 'StartQuery') {
        return { queryId: 'q8' };
      }
      if (command === 'DescribeQueries') {
        throw Object.assign(new Error('not authorized to perform logs:DescribeQueries'), { name: 'AccessDeniedException' });
      }
      return ++polls < 3 ? { status: 'Running' } : { status: 'Complete', results: [] };
    });
    const warnings: string[] = [];
    setLog({ info: () => undefined, warn: (m: string) => warnings.push(m), debug: () => undefined });
    await expect(runQuery(params(['us-east-2']), 60_000)).resolves.toHaveLength(1);
    expect(count('DescribeQueries')).toBe(1);
    expect(count('GetQueryResults')).toBe(3);
    expect(warnings[0]).toMatch(/allow logs:DescribeQueries/);
  });

  it('stops asking DescribeQueries when it does not list a running query', async () => {
    let polls = 0;
    sdk.setHandler((command) => {
      if (command === 'StartQuery') {
        return { queryId: 'q9' };
      }
      if (command === 'DescribeQueries') {
        return { queries: [] };
      }
      return ++polls < 4 ? { status: 'Running' } : { status: 'Complete', results: [] };
    });
    await runQuery(params(['us-east-2']), 60_000);
    expect(count('DescribeQueries')).toBe(2);
    expect(count('GetQueryResults')).toBe(4);
  });

  it('stops the AWS query when cancelled', async () => {
    sdk.setHandler((command) => (command === 'StartQuery' ? { queryId: 'q2' } : { status: 'Running' }));
    const run = runQuery(params(['us-east-2']), 60_000);
    await vi.waitFor(() => expect(sdk.calls.some((c) => c.command === 'GetQueryResults')).toBe(true));
    cancelQuery('tab-1');
    await expect(run).rejects.toMatchObject({ cancelled: true });
    expect(sdk.calls.filter((c) => c.command === 'StopQuery').map((c) => c.input.queryId)).toEqual(['q2']);
  });

  it('stops the query and says so when it runs past the timeout', async () => {
    sdk.setHandler((command) => (command === 'StartQuery' ? { queryId: 'q3' } : { status: 'Running' }));
    await expect(runQuery(params(['us-east-2']), 1200)).rejects.toThrow(/Stopped the query after 1 s/);
    expect(sdk.calls.some((c) => c.command === 'StopQuery')).toBe(true);
  });

  it('stops the other regions when one fails', async () => {
    sdk.setHandler((command, _input, region) => {
      if (command === 'StartQuery') {
        if (region === 'eu-west-1') {
          throw Object.assign(new Error('bad query'), { name: 'MalformedQueryException' });
        }
        return { queryId: `q-${region}` };
      }
      return { status: 'Running' };
    });
    await expect(runQuery(params(['us-east-2', 'eu-west-1']), 60_000)).rejects.toMatchObject({
      name: 'MalformedQueryException',
      message: 'bad query',
    });
    await vi.waitFor(() =>
      expect(sdk.calls.filter((c) => c.command === 'StopQuery').map((c) => c.input.queryId)).toEqual(['q-us-east-2'])
    );
  });

  it('reports a query that failed in AWS', async () => {
    sdk.setHandler((command) => (command === 'StartQuery' ? { queryId: 'q4' } : { status: 'Failed' }));
    await expect(runQuery(params(['us-east-2']), 60_000)).rejects.toThrow('The query failed in us-east-2');
  });

  it('cancels an earlier run of the same request', async () => {
    sdk.setHandler((command) => (command === 'StartQuery' ? { queryId: 'q5' } : { status: 'Running' }));
    const first = runQuery(params(['us-east-2']), 60_000);
    await vi.waitFor(() => expect(sdk.calls.some((c) => c.command === 'GetQueryResults')).toBe(true));
    sdk.setHandler((command) => (command === 'StartQuery' ? { queryId: 'q6' } : { status: 'Complete', results: [] }));
    const second = runQuery(params(['us-east-2']), 60_000);
    await expect(first).rejects.toMatchObject({ cancelled: true });
    await expect(second).resolves.toHaveLength(1);
  });
});

describe('listLogGroups', () => {
  it('lists groups with the prefix in the region', async () => {
    sdk.setHandler(() => ({ logGroups: [{ logGroupName: '/k8s/a', arn: 'arn:a' }, { arn: 'no-name' }] }));
    expect(await listLogGroups(undefined, 'us-east-2', ' /k8s/ ')).toEqual([
      { name: '/k8s/a', region: 'us-east-2', arn: 'arn:a' },
    ]);
    expect(sdk.calls[0].input).toEqual({ limit: 50, logGroupNamePrefix: '/k8s/' });
  });
});
