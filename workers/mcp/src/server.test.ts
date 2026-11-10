// @vitest-environment node
/**
 * End to end through the real MCP handler, with the SDK client on the other
 * side: what ChatGPT and Claude see when they connect.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { fixtureFetch } from '../../../site/upstream/__fixtures__/fixtureFetch';
import { WIDGET_META_KEY, WIDGET_RESOURCE_URI, readWidgetPayload } from '../../../site/appContract';
import { createServer, type Env } from './server';
import worker from './index';
import { cacheKey, cachedOutcome } from './cache';
import { DENY_LIST_HASH, denyListHash } from './safety';
import type { ToolOutcome } from './tools';

let client: Client | null = null;

afterEach(async () => {
  await client?.close();
  client = null;
  vi.unstubAllGlobals();
  // Even when an assertion fails first: a silenced console.error would hide later failures
  vi.restoreAllMocks();
});

async function connect(env: Env = {}): Promise<Client> {
  const upstream = { fetchImpl: fixtureFetch().fetchImpl };
  const handler = createMcpHandler(() => createServer(env, () => {}, upstream));
  const transport = new StreamableHTTPClientTransport(new URL('https://mcp.molviewer.bio/mcp'), {
    fetch: (input, init) => handler.fetch(new Request(input, init)),
  });
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

describe('MCP server', () => {
  it('lists three read-only tools with output schemas', async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['find_structures', 'get_structure_details', 'show_structure']);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
      expect(t.outputSchema).toBeDefined();
    }
    const show = tools.find((t) => t.name === 'show_structure')!;
    expect(show._meta).toMatchObject({ ui: { resourceUri: WIDGET_RESOURCE_URI } });
    // Only the render tool links to the UI.
    expect(tools.filter((t) => t._meta?.ui).map((t) => t.name)).toEqual(['show_structure']);
  });

  it('serves the widget resource with CSP and display modes', async () => {
    const c = await connect();
    const { contents } = await c.readResource({ uri: WIDGET_RESOURCE_URI });
    const item = contents[0] as { mimeType?: string; text?: string; _meta?: Record<string, unknown> };
    expect(item.mimeType).toBe('text/html;profile=mcp-app');
    expect(item.text).toContain('https://molviewer.bio/widget/v1/viewer.js');
    expect(item._meta).toMatchObject({
      ui: { csp: { resourceDomains: ['https://molviewer.bio'], connectDomains: expect.arrayContaining(['https://files.rcsb.org']) } },
      'openai/ui': { availableDisplayModes: ['inline', 'fullscreen', 'pip'] },
      'openai/widgetDomain': 'https://molviewer.bio',
      'openai/widgetCSP': { redirect_domains: ['https://molviewer.bio'] },
    });
    // No frames: the widget is our own bundle, not an iframe of /embed.
    expect(JSON.stringify(item._meta)).not.toContain('frameDomains');
  });

  it('calls show_structure and passes schema validation', async () => {
    const c = await connect();
    const result = await c.callTool({ name: 'show_structure', arguments: { kind: 'pdb', id: '3DNI' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ kind: 'pdb', id: '3DNI', shown: { style: 'cartoon' } });
    expect(readWidgetPayload(result._meta)?.load).toEqual({ kind: 'pdb', id: '3DNI' });
    // One text block: description, facts, a short request to answer, the link.
    const blocks = result.content as { type: string; text: string }[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toMatch(/^Showing 3DNI.*Reply with 2-4 sentences/);
  });

  it('passes output-schema validation for every tool and kind', async () => {
    const c = await connect();
    const calls = [
      { name: 'get_structure_details', arguments: { kind: 'pdb', id: '3DNI' } },
      { name: 'get_structure_details', arguments: { kind: 'pdb', id: '3DNI', sections: ['secondaryStructure', 'sequence', 'ligands', 'citation', 'related'] } },
      { name: 'get_structure_details', arguments: { kind: 'alphafold', id: 'P69905', sections: ['related', 'secondaryStructure'] } },
      { name: 'get_structure_details', arguments: { kind: 'compound', id: 'caffeine' } },
      { name: 'show_structure', arguments: { kind: 'alphafold', id: 'P69905' } },
      { name: 'show_structure', arguments: { kind: 'compound', id: 'caffeine' } },
      { name: 'find_structures', arguments: { query: 'caffeine' } },
    ];
    for (const call of calls) {
      const result = await c.callTool(call);
      expect(result.isError, JSON.stringify(call)).toBeFalsy();
      expect(result.structuredContent, JSON.stringify(call)).toBeDefined();
    }
  });

  it('returns tool errors in-band, not as protocol failures', async () => {
    const c = await connect();
    const result = await c.callTool({ name: 'show_structure', arguments: { kind: 'pdb', id: 'ZZZ9' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('No PDB entry');
  });

  it('keeps tool names, descriptions and schemas as approved', async () => {
    // OpenAI reviews tool metadata: a change here goes through its scan, so make it on purpose.
    const c = await connect();
    const { tools } = await c.listTools();
    const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted.map(({ name, title, description, inputSchema, outputSchema, annotations }) => ({ name, title, description, inputSchema, outputSchema, annotations }))).toMatchSnapshot();
  });

  it('records search analytics, and cache hits as such', async () => {
    const points: AnalyticsEngineDataPoint[] = [];
    const env: Env = { EVENTS: { writeDataPoint: (p?: AnalyticsEngineDataPoint) => p && points.push(p) } as AnalyticsEngineDataset };
    const store = new Map<string, string>();
    vi.stubGlobal('caches', {
      default: {
        match: async (req: Request) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
        put: async (req: Request, resp: Response) => void store.set(req.url, await resp.text()),
      },
    });
    const c = await connect(env);
    await c.callTool({ name: 'find_structures', arguments: { query: 'caffeine', kind: 'compound' } });
    await c.callTool({ name: 'find_structures', arguments: { query: 'caffeine', kind: 'compound' } });
    // blob3 = entry (shape), blob4 = format (sources), double1 = scale (words).
    expect(points.map((p) => [p.blobs?.[2], p.blobs?.[3], p.doubles?.[0]])).toEqual([
      ['w1_2', 'c1 p- r- u-', 1],
      ['w1_2', 'cache', 1],
    ]);
  });

  it('answers with a busy message when the caller is rate limited', async () => {
    const env: Env = { IP_LIMIT: { limit: async () => ({ success: false }) } as unknown as RateLimit };
    const c = await connect(env);
    const result = await c.callTool({ name: 'find_structures', arguments: { query: 'caffeine' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('busy');
  });
});

describe('error results carry their message for the widget', () => {
  // ChatGPT's window.openai fallback sees only _meta, not the text content
  const textOf = (result: { content?: unknown }) =>
    (result.content as { type: string; text: string }[]).find((c) => c.type === 'text')!.text;
  const markerOf = (result: { _meta?: Record<string, unknown> }) => result._meta?.[WIDGET_META_KEY];

  it('on a tool error', async () => {
    const c = await connect();
    const result = await c.callTool({ name: 'show_structure', arguments: { kind: 'pdb', id: 'ZZZ9' } });
    expect(result.isError).toBe(true);
    expect(markerOf(result)).toEqual({ error: textOf(result) });
    expect(textOf(result)).toContain('No PDB entry');
  });

  it('on a rate-limited call', async () => {
    const env: Env = { IP_LIMIT: { limit: async () => ({ success: false }) } as unknown as RateLimit };
    const c = await connect(env);
    const result = await c.callTool({ name: 'show_structure', arguments: { kind: 'pdb', id: '4HHB' } });
    expect(markerOf(result)).toEqual({ error: textOf(result) });
    expect(textOf(result)).toContain('busy');
  });

  it('on an unexpected failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('caches', { default: { match: async () => { throw new Error('cache down'); } } });
    const c = await connect();
    const result = await c.callTool({ name: 'show_structure', arguments: { kind: 'pdb', id: '4HHB' } });
    expect(markerOf(result)).toEqual({ error: textOf(result) });
    expect(textOf(result)).toContain('unexpected error');
  });

  it('not on an error from a tool without a widget', async () => {
    const c = await connect();
    const result = await c.callTool({ name: 'get_structure_details', arguments: { kind: 'pdb', id: 'ZZZ9' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('No PDB entry');
    expect(markerOf(result)).toBeUndefined();
  });

  it('not on a result that shows a structure', async () => {
    const c = await connect();
    const result = await c.callTool({ name: 'show_structure', arguments: { kind: 'pdb', id: '4HHB' } });
    expect(readWidgetPayload(result._meta)).not.toBeNull();
    expect(markerOf(result)).not.toHaveProperty('error');
  });
});

describe('worker routes', () => {
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

  it('serves the domain verification token as plain text', async () => {
    const resp = await worker.fetch(new Request('https://mcp.molviewer.bio/.well-known/openai-apps-challenge'), { OPENAI_APPS_CHALLENGE: 'tok123' }, ctx);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe('tok123');
    const missing = await worker.fetch(new Request('https://mcp.molviewer.bio/.well-known/openai-apps-challenge'), {}, ctx);
    expect(missing.status).toBe(404);
  });

  it('answers health checks and CORS preflights', async () => {
    expect((await worker.fetch(new Request('https://mcp.molviewer.bio/health'), {}, ctx)).status).toBe(200);
    const pre = await worker.fetch(new Request('https://mcp.molviewer.bio/mcp', { method: 'OPTIONS' }), {}, ctx);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('tool-result cache and the deny list', () => {
  function mapCache() {
    const store = new Map<string, string>();
    vi.stubGlobal('caches', {
      default: {
        match: async (req: Request) => (store.has(req.url) ? new Response(store.get(req.url)) : undefined),
        put: async (req: Request, resp: Response) => void store.set(req.url, await resp.text()),
      },
    });
    return store;
  }

  it('does not serve an answer cached under another deny list', async () => {
    const store = mapCache();
    const stale: ToolOutcome = { text: 'cached before the list changed', status: 'ok' };
    store.set(cacheKey('find_structures', { query: 'x' }, 'old-list'), JSON.stringify(stale));
    const fresh: ToolOutcome = { text: 'fresh', status: 'ok' };
    const { outcome, cached } = await cachedOutcome('find_structures', { query: 'x' }, async () => fresh, () => {});
    expect(cached).toBe(false);
    expect(outcome.text).toBe('fresh');
  });

  it('serves an answer cached under the current deny list', async () => {
    const store = mapCache();
    const hit: ToolOutcome = { text: 'cached', status: 'ok' };
    store.set(cacheKey('find_structures', { query: 'x' }), JSON.stringify(hit));
    const { outcome, cached } = await cachedOutcome('find_structures', { query: 'x' }, async () => ({ text: 'fresh', status: 'ok' }), () => {});
    expect(cached).toBe(true);
    expect(outcome.text).toBe('cached');
  });

  it('keys differ when the deny list differs', () => {
    expect(cacheKey('show_structure', { id: 'caffeine' }, 'a')).not.toBe(cacheKey('show_structure', { id: 'caffeine' }, 'b'));
    expect(cacheKey('show_structure', { id: 'caffeine' })).toContain(DENY_LIST_HASH);
  });

  it('the deny-list hash changes when a CID is added', () => {
    const base = denyListHash([7871, 7305], /\b(sarin)\b/i, ['x']);
    expect(denyListHash([7871, 7305, 1], /\b(sarin)\b/i, ['x'])).not.toBe(base);
    expect(denyListHash([7305, 7871], /\b(sarin)\b/i, ['x'])).toBe(base);
    expect(denyListHash([7871, 7305], /\b(sarin|soman)\b/i, ['x'])).not.toBe(base);
  });
});
