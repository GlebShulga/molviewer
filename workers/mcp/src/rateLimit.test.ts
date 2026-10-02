// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ServerContext } from '@modelcontextprotocol/server';
import { limitCaller } from './rateLimit';
import type { Env } from './server';

/** A limiter that allows `max` calls per key and records the keys it saw. */
function limiter(max: number) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const binding = {
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= max };
    },
  } as unknown as RateLimit;
  return { binding, keys };
}

function ctx(ip: string, subject?: string): ServerContext {
  return {
    mcpReq: { _meta: subject ? { 'openai/subject': subject } : {} },
    http: { req: new Request('https://mcp.molviewer.bio/mcp', { headers: { 'cf-connecting-ip': ip } }) },
  } as unknown as ServerContext;
}

describe('limitCaller', () => {
  it('limits each ChatGPT user separately, under the shared per-IP allowance', async () => {
    const user = limiter(2);
    const ip = limiter(100);
    const env: Env = { USER_LIMIT: user.binding, IP_LIMIT: ip.binding };
    expect(await limitCaller(env, ctx('1.1.1.1', 'alice'))).toBe(true);
    expect(await limitCaller(env, ctx('1.1.1.1', 'alice'))).toBe(true);
    expect(await limitCaller(env, ctx('1.1.1.1', 'alice'))).toBe(false);
    expect(await limitCaller(env, ctx('1.1.1.1', 'bob'))).toBe(true);
  });

  it("doesn't put all users of a provider without user ids into one small bucket", async () => {
    const user = limiter(2);
    const ip = limiter(100);
    const env: Env = { USER_LIMIT: user.binding, IP_LIMIT: ip.binding };
    for (let i = 0; i < 10; i++) expect(await limitCaller(env, ctx('2.2.2.2'))).toBe(true);
    expect(user.keys).toEqual([]);
  });

  it('caps a client that makes up a new subject on every call', async () => {
    const env: Env = { USER_LIMIT: limiter(30).binding, IP_LIMIT: limiter(5).binding };
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await limitCaller(env, ctx('3.3.3.3', `fake-${i}`)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('never blocks when the bindings are missing or fail', async () => {
    expect(await limitCaller({}, ctx('4.4.4.4'))).toBe(true);
    const broken = { limit: async () => { throw new Error('down'); } } as unknown as RateLimit;
    expect(await limitCaller({ IP_LIMIT: broken }, ctx('4.4.4.4'))).toBe(true);
  });
});
