import { Readable, Transform, pipeline } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';

/** How big one response was on the wire, and unpacked. */
export interface Transfer {
  /** e.g. GetQueryResultsCommand. */
  command: string;
  wireBytes: number;
  /** Bytes the SDK read; the same as wireBytes when the response came uncompressed. */
  bytes: number;
  gzip: boolean;
}

/** Passes chunks through, telling how many bytes went by. */
function counter(onBytes: (n: number) => void): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      onBytes(chunk.length);
      done(null, chunk);
    },
  });
}

/**
 * Asks CloudWatch for gzip and unpacks it before the SDK reads the body. Query results are mostly
 * log text, which compresses several times over, and the SDK for Node does not ask for compression
 * itself (Grafana's Go SDK does, through Go's HTTP client). `onTransfer` hears each response's size.
 *
 * It runs right next to the HTTP call, after signing: Accept-Encoding goes out unsigned, which AWS
 * allows for headers outside the signature.
 */
export function acceptGzip(client: CloudWatchLogsClient, onTransfer?: (transfer: Transfer) => void) {
  client.middlewareStack.add(
    (next, context) => async (args) => {
      const request = args.request as { headers?: Record<string, string> };
      if (request?.headers) {
        request.headers['accept-encoding'] = 'gzip';
      }
      const result = await next(args);
      const response = result.response as { headers?: Record<string, string>; body?: unknown };
      if (!response?.headers || !(response.body instanceof Readable)) {
        return result;
      }
      const gzip = /\bgzip\b/i.test(response.headers['content-encoding'] ?? '');
      let wireBytes = 0;
      let bytes = 0;
      const ignore = () => undefined;
      let body: Transform;
      if (gzip) {
        delete response.headers['content-encoding'];
        delete response.headers['content-length'];
        body = pipeline(
          response.body,
          counter((n) => (wireBytes += n)),
          createGunzip(),
          counter((n) => (bytes += n)),
          ignore
        );
      } else {
        body = pipeline(
          response.body,
          counter((n) => (wireBytes += n)),
          ignore
        );
      }
      const command = (context as { commandName?: string }).commandName ?? 'request';
      body.on('end', () => onTransfer?.({ command, wireBytes, bytes: gzip ? bytes : wireBytes, gzip }));
      response.body = body;
      return result;
    },
    // In the deserialize step after the deserializer, so `next` is the HTTP call itself.
    { step: 'deserialize', priority: 'low', name: 'acceptGzip' }
  );
}
