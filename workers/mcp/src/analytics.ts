/**
 * `mcp_tool_call` events in the site's Analytics Engine dataset, laid out
 * like functions/api/event.ts writes them so scripts/query-events.ts reads
 * both:
 *   index1 = a new random id per request: nothing links one person's calls
 *   blob1 = event name, blob2.. = STRING_FIELDS (source, entry, format, kind, ref, value),
 *   blob8 = page kind ("mcp"), blob9 = country, blob10.. = CONTEXT_FIELDS
 *   (env = "prod", schema = SCHEMA_VERSION, the rest empty),
 *   double1.. = NUMBER_FIELDS (scale, seconds, the rest 0; no ASN)
 * Here: source = tool, kind = structure kind, ref = client, value = outcome, atoms = 0.
 * For find_structures also entry = query shape (queryShape in catalog.ts),
 * format = what each source returned (SearchDiag in tools.ts) or "cache" for
 * a cached answer, scale = words in the query.
 * Arguments (search text, ids) are never stored.
 */
import { CONTEXT_FIELDS, NUMBER_FIELDS, SCHEMA_VERSION, STRING_FIELDS } from '../../../site/events';
import type { Env } from './server';

export interface ToolCallEvent {
  tool: string;
  kind: string;
  client: string;
  status: string;
  ms: number;
  entry?: string;
  format?: string;
  scale?: number;
}

export function recordToolCall(env: Env, e: ToolCallEvent): void {
  if (!env.EVENTS) return;
  const strings: Record<(typeof STRING_FIELDS)[number], string> = {
    source: e.tool,
    entry: e.entry ?? '',
    format: e.format ?? '',
    kind: e.kind,
    ref: e.client,
    value: e.status,
  };
  const numbers: Partial<Record<(typeof NUMBER_FIELDS)[number], number>> = { scale: e.scale ?? 0, seconds: e.ms / 1000 };
  const context: Partial<Record<(typeof CONTEXT_FIELDS)[number], string>> = { env: 'prod', schema: SCHEMA_VERSION };
  try {
    env.EVENTS.writeDataPoint({
      indexes: [crypto.randomUUID()],
      blobs: [
        'mcp_tool_call',
        ...STRING_FIELDS.map((k) => strings[k]),
        'mcp',
        '',
        ...CONTEXT_FIELDS.map((k) => context[k] ?? ''),
      ],
      doubles: NUMBER_FIELDS.map((k) => numbers[k] ?? 0),
    });
  } catch {
    // Analytics is best effort.
  }
}
