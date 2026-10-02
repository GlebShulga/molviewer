/**
 * `mcp_tool_call` events in the site's Analytics Engine dataset, laid out
 * like functions/api/event.ts writes them so scripts/query-events.ts reads
 * both:
 *   blob1 = event name, blob2.. = STRING_FIELDS (source, entry, format, kind, ref, value),
 *   blob8 = page kind ("mcp"), blob9 = country, double1.. = NUMBER_FIELDS (scale, seconds)
 * Here: source = tool, kind = structure kind, ref = client, value = outcome.
 * Arguments (search text, ids) are never stored.
 */
import { NUMBER_FIELDS, STRING_FIELDS } from '../../../site/events';
import type { Env } from './server';

export interface ToolCallEvent {
  tool: string;
  kind: string;
  client: string;
  status: string;
  ms: number;
}

export function recordToolCall(env: Env, e: ToolCallEvent): void {
  if (!env.EVENTS) return;
  const strings: Record<(typeof STRING_FIELDS)[number], string> = {
    source: e.tool,
    entry: '',
    format: '',
    kind: e.kind,
    ref: e.client,
    value: e.status,
  };
  const numbers: Record<(typeof NUMBER_FIELDS)[number], number> = { scale: 0, seconds: e.ms / 1000 };
  try {
    env.EVENTS.writeDataPoint({
      indexes: ['mcp_tool_call'],
      blobs: ['mcp_tool_call', ...STRING_FIELDS.map((k) => strings[k]), 'mcp', ''],
      doubles: NUMBER_FIELDS.map((k) => numbers[k]),
    });
  } catch {
    // Analytics is best effort.
  }
}
