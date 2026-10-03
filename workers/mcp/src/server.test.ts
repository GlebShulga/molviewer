// @vitest-environment node
/**
 * End to end through the real MCP handler, with the SDK client on the other
 * side: what ChatGPT and Claude see when they connect.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { fixtureFetch } from '../../../site/upstream/__fixtures__/fixtureFetch';
import { WIDGET_RESOURCE_URI, readWidgetPayload } from '../../../site/appContract';
import { createServer, type Env } from './server';
import worker from './index';

let client: Client | null = null;

afterEach(async () => {
  await client?.close();
  client = null;
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

  it('answers with a busy message when the caller is rate limited', async () => {
    const env: Env = { IP_LIMIT: { limit: async () => ({ success: false }) } as unknown as RateLimit };
    const c = await connect(env);
    const result = await c.callTool({ name: 'find_structures', arguments: { query: 'caffeine' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('busy');
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
