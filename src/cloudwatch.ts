import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, DescribeLogGroupsCommand, DescribeQueryDefinitionsCommand, PutQueryDefinitionCommand, DeleteQueryDefinitionCommand } from '@aws-sdk/client-cloudwatch-logs';

export interface InsightsQueryParams {
  logGroupNames: string[];
  queryString: string;
  startTime: number; // epoch seconds
  endTime: number;   // epoch seconds
  region: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

export interface QueryResultField {
  field: string;
  value: string;
}

export interface InsightsQueryResultRow {
  fields: QueryResultField[];
}

export interface InsightsFinalResult {
  rows: InsightsQueryResultRow[];
  statistics?: Record<string, unknown>;
  status: string;
  fieldOrder: string[];
}

// Simple per-region client cache so we do not re-create clients for every request
const clientCache: Record<string, CloudWatchLogsClient> = {};
function getClient(region: string): CloudWatchLogsClient {
  if (!clientCache[region]) {
    clientCache[region] = new CloudWatchLogsClient({ region });
  }
  return clientCache[region];
}

export async function listLogGroups(region: string, prefix?: string, limit = 200): Promise<string[]> {
  const client = getClient(region);
  const names: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
  const resp: any = await client.send(new DescribeLogGroupsCommand({
      nextToken,
      logGroupNamePrefix: prefix,
      limit: Math.min(50, limit - names.length)
    }));
    (resp.logGroups || []).forEach((lg: any) => { if (lg.logGroupName) names.push(lg.logGroupName as string); });
    nextToken = resp.nextToken;
  } while (nextToken && names.length < limit);
  return names;
}

export async function runInsightsQuery(params: InsightsQueryParams, abortSignal?: AbortSignal): Promise<InsightsFinalResult> {
  const { logGroupNames, queryString, startTime, endTime, region, pollIntervalMs, timeoutMs } = params;
  const client = getClient(region);

  const startResp = await client.send(new StartQueryCommand({
    logGroupNames,
    queryString,
    startTime,
    endTime,
  }));

  if (!startResp.queryId) {
    throw new Error('Failed to start query');
  }

  const queryId = startResp.queryId;
  const start = Date.now();
  while (true) {
    if (abortSignal?.aborted) {
      throw new Error('Query aborted');
    }
    const resp = await client.send(new GetQueryResultsCommand({ queryId }));
    if (resp.status === 'Complete' || resp.status === 'Failed' || resp.status === 'Cancelled' || resp.status === 'Timeout') {
      const rows = (resp.results || []).map(r => ({
        fields: (r || []).map(f => ({ field: f.field || '', value: f.value || '' }))
      }));
      const fieldSet = new Set<string>();
      rows.forEach(r => r.fields.forEach(f => fieldSet.add(f.field)));
      return {
        rows,
        statistics: resp.statistics as Record<string, unknown> | undefined,
        status: resp.status || 'Unknown',
        fieldOrder: Array.from(fieldSet)
      };
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('Query timeout exceeded');
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
}

// AWS Saved Query Definitions (Logs Insights)
export interface QueryDefinitionSummary {
  id: string;
  name: string;
  queryString: string;
  logGroupNames?: string[];
}

export async function listQueryDefinitions(region: string, limit = 1000): Promise<QueryDefinitionSummary[]> {
  const client = getClient(region);
  const results: QueryDefinitionSummary[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const resp: any = await client.send(new DescribeQueryDefinitionsCommand({
      nextToken,
      maxResults: 100
    }));
    (resp.queryDefinitions || []).forEach((qd: any) => {
      if (qd.queryDefinitionId && qd.name && qd.queryString) {
        results.push({
          id: qd.queryDefinitionId,
          name: qd.name,
            // AWS returns single string or array? For Logs Insights it's array 'logGroupNames'
          queryString: qd.queryString,
          logGroupNames: qd.logGroupNames
        });
      }
    });
    nextToken = resp.nextToken;
  } while (nextToken && results.length < limit);
  return results.slice(0, limit);
}

export interface PutQueryDefinitionInput {
  id?: string; // if provided, updates existing definition
  name: string;
  queryString: string;
  logGroupNames?: string[];
}

export async function putQueryDefinition(region: string, input: PutQueryDefinitionInput): Promise<string> {
  const client = getClient(region);
  const resp: any = await client.send(new PutQueryDefinitionCommand({
    queryDefinitionId: input.id,
    name: input.name,
    queryString: input.queryString,
    logGroupNames: input.logGroupNames && input.logGroupNames.length ? input.logGroupNames : undefined
  }));
  if (!resp.queryDefinitionId) throw new Error('Failed to save query definition');
  return resp.queryDefinitionId as string;
}

export async function deleteQueryDefinition(region: string, id: string): Promise<void> {
  const client = getClient(region);
  await client.send(new DeleteQueryDefinitionCommand({ queryDefinitionId: id }));
}
