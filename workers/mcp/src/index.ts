/**
 * MolViewer MCP server for ChatGPT and Claude, deployed as its own Worker at
 * https://mcp.molviewer.bio (see workers/mcp/README.md).
 *
 *   POST /mcp                                MCP over Streamable HTTP, stateless
 *   GET  /.well-known/openai-apps-challenge  OpenAI domain verification token
 *   GET  /health                             liveness check
 */
import { createMcpHandler } from '@modelcontextprotocol/server';
import { SITE_ORIGIN } from '../../../site/nav';
import { createServer, SERVER_VERSION, type Env } from './server';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
  'access-control-max-age': '86400',
};

function withCors(resp: Response): Response {
  const out = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
  return out;
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/mcp') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
      // One stateless handler per request: the factory needs this request's waitUntil.
      const handler = createMcpHandler(() => createServer(env, (p) => ctx.waitUntil(p)), {
        onerror: (err) => console.error('mcp', err),
      });
      return withCors(await handler.fetch(request));
    }

    if (pathname === '/.well-known/openai-apps-challenge') {
      return env.OPENAI_APPS_CHALLENGE ? text(env.OPENAI_APPS_CHALLENGE) : text('Not configured', 404);
    }

    if (pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, version: SERVER_VERSION }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (pathname === '/') {
      return text(
        `MolViewer MCP server. Connect an MCP client to ${new URL('/mcp', request.url)}.\n` +
          `The viewer itself is at ${SITE_ORIGIN}.\n`
      );
    }

    return text('Not found', 404);
  },
} satisfies ExportedHandler<Env>;
