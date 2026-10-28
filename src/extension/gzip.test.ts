import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { CloudWatchLogsClient, GetQueryResultsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { Transfer, acceptGzip } from './gzip';

// A stand-in for CloudWatch: answers every call with `body`, gzipped when asked and allowed.
let server: Server | undefined;
let seen: IncomingHttpHeaders | undefined;

async function fakeCloudWatch(status: number, body: unknown, compress: boolean): Promise<string> {
  server = createServer((req, res) => {
    seen = req.headers;
    req.resume();
    req.on('end', () => {
      const json = Buffer.from(JSON.stringify(body));
      const gzip = compress && /gzip/.test(String(req.headers['accept-encoding']));
      res.writeHead(status, {
        'content-type': 'application/x-amz-json-1.1',
        ...(gzip ? { 'content-encoding': 'gzip' } : {}),
      });
      res.end(gzip ? gzipSync(json) : json);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function client(endpoint: string, transfers: Transfer[]) {
  const c = new CloudWatchLogsClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    maxAttempts: 1,
  });
  acceptGzip(c, (t) => transfers.push(t));
  return c;
}

afterEach(() => {
  server?.close();
  server = undefined;
});

const results = {
  status: 'Complete',
  results: [[{ field: '@message', value: '{"level":"info","msg":"request handled"} '.repeat(200) }]],
  statistics: { bytesScanned: 10, recordsMatched: 1, recordsScanned: 1 },
};

describe('acceptGzip', () => {
  it('asks for gzip and unpacks the answer before the SDK reads it', async () => {
    const transfers: Transfer[] = [];
    const c = client(await fakeCloudWatch(200, results, true), transfers);
    const response = await c.send(new GetQueryResultsCommand({ queryId: 'q' }));
    expect(seen?.['accept-encoding']).toBe('gzip');
    expect(response.results?.[0][0].value).toBe(results.results[0][0].value);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ command: 'GetQueryResultsCommand', gzip: true });
    expect(transfers[0].wireBytes).toBeLessThan(transfers[0].bytes / 10);
  });

  it('reads an uncompressed answer as it is', async () => {
    const transfers: Transfer[] = [];
    const c = client(await fakeCloudWatch(200, results, false), transfers);
    const response = await c.send(new GetQueryResultsCommand({ queryId: 'q' }));
    expect(response.status).toBe('Complete');
    expect(transfers[0]).toMatchObject({ gzip: false });
    expect(transfers[0].bytes).toBe(transfers[0].wireBytes);
  });

  it('unpacks errors too', async () => {
    const c = client(
      await fakeCloudWatch(400, { __type: 'MalformedQueryException', message: 'unexpected symbol' }, true),
      []
    );
    await expect(c.send(new GetQueryResultsCommand({ queryId: 'q' }))).rejects.toMatchObject({
      name: 'MalformedQueryException',
      message: 'unexpected symbol',
    });
  });
});
