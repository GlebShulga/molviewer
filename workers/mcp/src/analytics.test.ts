// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { recordToolCall } from './analytics';
import type { Env } from './server';

describe('recordToolCall', () => {
  it('writes schema 2 with a new id per call, page kind and country in place, and no network', () => {
    const points: AnalyticsEngineDataPoint[] = [];
    const env = { EVENTS: { writeDataPoint: (p?: AnalyticsEngineDataPoint) => p && points.push(p) } } as unknown as Env;
    const call = { tool: 'find_structures', kind: 'pdb', client: 'chatgpt', status: 'ok', ms: 250, scale: 2 };
    recordToolCall(env, call);
    recordToolCall(env, call);

    const [a, b] = points;
    expect(a.indexes?.[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.indexes?.[0]).not.toBe(b.indexes?.[0]);
    expect(a.blobs?.[0]).toBe('mcp_tool_call');
    expect(a.blobs?.[7]).toBe('mcp'); // blob8
    expect(a.blobs?.[8]).toBe(''); // blob9
    expect(a.blobs?.[9]).toBe('prod'); // blob10
    expect(a.blobs?.[14]).toBe('2'); // blob15
    expect(a.blobs).toHaveLength(16);
    expect(a.doubles).toEqual([2, 0.25, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
