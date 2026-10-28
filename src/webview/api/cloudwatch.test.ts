import type { RegionResult } from '../../shared/types';
import {
  applyQuerySort,
  estimateQueryString,
  fixErrorPosition,
  queryPrefix,
  resultsToRows,
  returnsMessage,
  sumEstimates,
  withMessageField,
} from './cloudwatch';

const row = (fields: Record<string, string>) => Object.entries(fields).map(([field, value]) => ({ field, value }));

describe('resultsToRows', () => {
  const region: RegionResult = {
    region: 'us-east-2',
    rows: [
      row({
        '@timestamp': '2025-10-09 08:53:20.000',
        __message__internal__: '{"a":1}',
        __log__internal__: '123:g',
        message: 'hello',
        userId: '42',
        '@ptr': 'abc',
      }),
      row({ '@timestamp': '2025-10-09 08:53:21.000', __log__internal__: '123:g', message: 'world', '@ptr': 'def' }),
    ],
    statistics: { bytesScanned: 100, recordsMatched: 2 },
  };

  it('drops internal fields, @ptr and the implicit @timestamp', () => {
    const { fields, rows } = resultsToRows([region], 'fields message, userId');
    expect(fields).toEqual(['message', 'userId']);
    expect(rows).toEqual([{ message: 'hello', userId: '42' }, { message: 'world' }]);
  });

  it('keeps the raw message, log group and time per row', () => {
    const { details } = resultsToRows([region], 'fields message');
    expect(details).toEqual([
      { message: '{"a":1}', logGroup: '123:g', logStream: undefined, timestamp: Date.UTC(2025, 9, 9, 8, 53, 20) },
      { message: undefined, logGroup: '123:g', logStream: undefined, timestamp: Date.UTC(2025, 9, 9, 8, 53, 21) },
    ]);
  });

  it('sums query statistics across regions', () => {
    expect(resultsToRows([region, { ...region, region: 'eu-west-1' }], 'fields message').stats).toEqual({
      bytesScanned: 200,
      recordsMatched: 4,
    });
  });

  it('keeps @timestamp when the query asks for it, as epoch millis', () => {
    const { fields, rows, timeFields } = resultsToRows([region], 'fields @timestamp, message');
    expect(fields[0]).toBe('@timestamp');
    expect(timeFields).toEqual(['@timestamp']);
    expect(rows[0]['@timestamp']).toBe(String(Date.UTC(2025, 9, 9, 8, 53, 20)));
  });

  it('treats bin() and other CloudWatch times as time fields', () => {
    const stats: RegionResult = {
      region: 'us-east-2',
      rows: [row({ 'bin(5m)': '2025-10-09 08:50:00.000', 'count()': '7' })],
    };
    const { timeFields, rows } = resultsToRows([stats], 'stats count() by bin(5m)');
    expect(timeFields).toEqual(['bin(5m)']);
    expect(rows[0]).toEqual({ 'bin(5m)': String(Date.UTC(2025, 9, 9, 8, 50)), 'count()': '7' });
  });
});

describe('applyQuerySort', () => {
  it('sorts rows merged from several regions', () => {
    const a = resultsToRows(
      [
        { region: 'a', rows: [row({ '@timestamp': '2025-10-09 08:00:00.000', n: '1' })] },
        { region: 'b', rows: [row({ '@timestamp': '2025-10-09 09:00:00.000', n: '2' })] },
      ],
      'fields n | sort @timestamp desc'
    );
    expect(applyQuerySort(a, 'fields n | sort @timestamp desc').rows.map((r) => r.n)).toEqual(['2', '1']);
  });
});

describe('query prefix', () => {
  it('goes on the first line', () => {
    const prefix = queryPrefix('fields a\n| limit 5');
    expect(withMessageField('fields a\n| limit 5')).toBe(`${prefix}fields a\n| limit 5`);
    expect(prefix).not.toContain('\n');
    expect(prefix).toContain('@message as __message__internal__');
  });

  it('leaves out its own @message when the query returns @message', () => {
    expect(queryPrefix('fields @timestamp, @message | sort @timestamp desc')).not.toContain('@message');
  });

  it('is taken out of error positions on the first line', () => {
    const length = queryPrefix('fields a').length;
    expect(fixErrorPosition(`unexpected symbol found at line 1 and position ${length + 7}`, length)).toBe(
      'unexpected symbol found at line 1 and position 7'
    );
    expect(fixErrorPosition('unexpected symbol found at line 3 and position 4', length)).toBe(
      'unexpected symbol found at line 3 and position 4'
    );
  });
});

describe('returnsMessage', () => {
  it.each([
    ['fields @timestamp, @message | sort @timestamp desc | limit 100', true],
    ['fields @message', true],
    ['filter level = "error" | fields @timestamp, `@message` | limit 5', true],
    ['fields @timestamp, @message | parse @message "* *" as a, b | dedup a', true],
    ['fields @timestamp | filter @message like /x/', false],
    ['fields @message as msg', false],
    ['fields strlen(@message)', false],
    ['fields @timestamp, @message | stats count() by bin(5m)', false],
    ['fields @timestamp, @message | display @timestamp', false],
    ['fields @message | pattern @message', false],
    ['fields @message | filter x in (SOURCE g | fields @message)', true],
    ['fields a | filter x in (SOURCE g | fields @message)', false],
  ])('%s → %s', (query, expected) => {
    expect(returnsMessage(query)).toBe(expected);
  });
});

describe('the raw message of a row', () => {
  it("comes from the query's own @message when we did not ask for a copy", () => {
    const { details } = resultsToRows(
      [{ region: 'r', rows: [row({ '@timestamp': '2025-10-09 08:53:20.000', '@message': '{"a":1}' })] }],
      'fields @timestamp, @message'
    );
    expect(details[0].message).toBe('{"a":1}');
  });
});

describe('estimate', () => {
  it('puts estimate at the end of the query, on its own line', () => {
    expect(estimateQueryString('fields @message # trailing comment')).toBe('fields @message # trailing comment\n| estimate');
    expect(estimateQueryString('fields a | estimate')).toBe('fields a | estimate');
  });

  it('adds up the regions', () => {
    const answer = (bytes: string) => ({ region: 'r', rows: [row({ '@estimatedBytesScanned': bytes })] });
    expect(sumEstimates([answer('1000'), answer('24')])).toBe(1024);
    expect(() => sumEstimates([{ region: 'r', rows: [] }])).toThrow('did not return an estimate');
  });
});
