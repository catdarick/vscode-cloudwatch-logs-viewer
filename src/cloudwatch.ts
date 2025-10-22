import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, StopQueryCommand, DescribeLogGroupsCommand, DescribeQueryDefinitionsCommand, PutQueryDefinitionCommand, DeleteQueryDefinitionCommand, DescribeQueriesCommand } from '@aws-sdk/client-cloudwatch-logs';

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
  
  // Register abort handler to call StopQuery on AWS side
  const abortHandler = async () => {
    try {
      await client.send(new StopQueryCommand({ queryId }));
    } catch (err) {
      // Ignore errors from StopQuery (query may have already completed)
    }
  };
  if (abortSignal) {
    abortSignal.addEventListener('abort', abortHandler);
  }
  
  try {
    // Poll for status using DescribeQueries (lightweight, doesn't return all data)
    while (true) {
      if (abortSignal?.aborted) {
        throw new Error('Query aborted');
      }
      
      const describeResp = await client.send(new DescribeQueriesCommand({ 
        logGroupName: logGroupNames[0],
        maxResults: 10
      }));
      
      // Find our query in the results
      const queryInfo = describeResp.queries?.find(q => q.queryId === queryId);
      
      if (!queryInfo) {
        throw new Error('Query not found in DescribeQueries results');
      }
      
      const isTerminal = queryInfo.status === 'Complete' || queryInfo.status === 'Failed' || 
                         queryInfo.status === 'Cancelled' || queryInfo.status === 'Timeout';
      
      if (isTerminal) {
        // Query finished - fetch results once
        const resp = await client.send(new GetQueryResultsCommand({ queryId }));
        
        const rows = (resp.results || []).map(r => ({
          fields: (r || []).map(f => ({ field: f.field || '', value: f.value || '' }))
        }));
        
        // Derive field order from query
        const discovered = new Set<string>();
        rows.forEach(r => r.fields.forEach(f => { if (f.field) discovered.add(f.field); }));
        const explicit = extractFieldsOrder(queryString);
        const ordered = [...explicit, ...Array.from(discovered).filter(f => !explicit.includes(f))];
        
        return {
          rows,
          statistics: resp.statistics as Record<string, unknown> | undefined,
          status: queryInfo.status || 'Unknown',
          fieldOrder: ordered
        };
      }
      
      if (Date.now() - start > timeoutMs) {
        throw new Error('Query timeout exceeded');
      }
      
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
  } finally {
    // Cleanup abort listener
    if (abortSignal) {
      abortSignal.removeEventListener('abort', abortHandler);
    }
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

// Attempt to parse the first Logs Insights `fields` clause to preserve user-specified order
function extractFieldsOrder(query: string): string[] {
  if (!query) return [];
  // Normalize line endings and split at pipes so we don't grab following commands
  const lower = query.toLowerCase();
  const idx = lower.indexOf('fields ');
  if (idx === -1) return [];
  // Slice from 'fields ' onwards until newline or next pipe
  const slice = query.slice(idx); // original casing preserved
  const terminatorIdx = slice.search(/\n|\|/); // stop at first newline or pipe
  const clause = terminatorIdx >= 0 ? slice.substring(0, terminatorIdx) : slice;
  // Remove leading 'fields'
  const afterKeyword = clause.replace(/^[Ff][Ii][Ee][Ll][Dd][Ss]\s+/, '');
  // Split on commas not inside quotes (lightweight – queries usually simple)
  const parts = afterKeyword.split(',');
  const ordered: string[] = [];
  for (let raw of parts) {
    let token = raw.trim();
    if (!token) continue;
    // Remove inline comments starting with #
    const cIdx = token.indexOf('#');
    if (cIdx >= 0) token = token.slice(0, cIdx).trim();
    if (!token) continue;
    // Handle aliases: pattern  expr  as alias
    const aliasMatch = token.match(/^(.*?)\s+as\s+([A-Za-z0-9_@.]+)/i);
    if (aliasMatch) {
      token = aliasMatch[2];
    }
    // Remove surrounding quotes if any
    token = token.replace(/^['"]|['"]$/g, '');
    // Only keep plausible field identifiers (permit @, letters, numbers, underscore, dot)
    if (!/^[@A-Za-z0-9_.]+$/.test(token)) continue;
    if (!ordered.includes(token)) ordered.push(token);
  }
  return ordered;
}
