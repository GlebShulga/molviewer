/**
 * Minimal MCP Apps host for local testing (not deployed): calls a tool on the
 * local MCP server, renders the UI resource in a sandboxed iframe with an
 * opaque origin under the resource's declared CSP (as ChatGPT and Claude
 * do), and drives it through ext-apps' AppBridge.
 *
 * Query parameters: ?server=<mcp url>&tool=<name>&args=<json>&dark=1&auto=1&safe=<top>,<bottom>
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

const params = new URLSearchParams(location.search);
const SERVER = params.get('server') ?? 'http://localhost:8787/mcp';
const logEl = document.getElementById('log')!;
const frame = document.getElementById('frame') as HTMLIFrameElement;
const toolEl = document.getElementById('tool') as HTMLSelectElement;
const argsEl = document.getElementById('args') as HTMLInputElement;
const darkEl = document.getElementById('dark') as HTMLInputElement;

function log(...parts: unknown[]): void {
  logEl.textContent += parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ') + '\n';
  // eslint-disable-next-line no-console -- dev tool: the browser console is part of its output
  console.log('[host]', ...parts);
}

interface UiCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
}

/** The CSP a host builds from the resource's `_meta.ui.csp`. */
function cspFor(csp: UiCsp = {}): string {
  const res = (csp.resourceDomains ?? []).join(' ');
  return [
    `default-src 'none'`,
    `script-src 'unsafe-inline' ${res}`,
    `style-src 'unsafe-inline' ${res}`,
    `img-src data: blob: ${res}`,
    `font-src data: ${res}`,
    `connect-src ${(csp.connectDomains ?? []).join(' ')}`,
    `worker-src blob:`,
    `frame-src ${(csp.frameDomains ?? []).join(' ') || "'none'"}`,
  ].join('; ');
}

async function run(tool: string, args: Record<string, unknown>, dark: boolean): Promise<void> {
  logEl.textContent = '';
  const client = new Client({ name: 'molviewer-dev-host', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(SERVER)));

  const { tools } = await client.listTools();
  const def = tools.find((t) => t.name === tool);
  const uri = (def?._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri;
  log('call', tool, args);
  const result = await client.callTool({ name: tool, arguments: args, _meta: { 'openai/subject': 'dev-host' } });
  log('result', { isError: result.isError, text: (result.content as { text?: string }[])[0]?.text, _meta: result._meta });
  if (!uri) {
    frame.srcdoc = '<p style="font-family:sans-serif">This tool has no UI.</p>';
    return;
  }

  const { contents } = await client.readResource({ uri });
  const item = contents[0] as { text?: string; _meta?: { ui?: { csp?: UiCsp } } };
  const csp = cspFor(item._meta?.ui?.csp);
  log('csp', csp);
  const html = (item.text ?? '').replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);

  const bridge = new AppBridge(
    client,
    { name: 'molviewer-dev-host', version: '1.0.0' },
    { openLinks: {}, serverTools: {}, logging: {} },
    {
      hostContext: {
        theme: dark ? 'dark' : 'light',
        displayMode: 'inline',
        availableDisplayModes: ['inline', 'fullscreen'],
        platform: 'web',
      },
    }
  );
  bridge.onopenlink = async ({ url }) => {
    log('open-link', url);
    return {};
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    const next = mode === 'fullscreen' ? 'fullscreen' : 'inline';
    frame.classList.toggle('fullscreen', next === 'fullscreen');
    if (next === 'fullscreen') frame.style.height = '';
    // ?safe=top,bottom: report safe-area insets in fullscreen, as a host with overlay controls would.
    const safe = params.get('safe')?.split(',').map(Number);
    void bridge.sendHostContextChange({
      displayMode: next,
      ...(safe && next === 'fullscreen' ? { safeAreaInsets: { top: safe[0] || 0, right: 0, bottom: safe[1] || 0, left: 0 } } : {}),
    });
    log('display-mode', next);
    return { mode: next };
  };
  bridge.onsizechange = ({ height }) => {
    if (height && !frame.classList.contains('fullscreen')) frame.style.height = `${Math.min(height, 800)}px`;
  };
  bridge.onloggingmessage = (m) => log('widget log', m);
  bridge.oninitialized = () => {
    log('widget initialized');
    void bridge.sendToolInput({ arguments: args });
    void bridge.sendToolResult(result as Parameters<typeof bridge.sendToolResult>[0]);
  };

  // Opaque origin like real hosts: scripts allowed, no same-origin access.
  frame.setAttribute('sandbox', 'allow-scripts allow-popups');
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  await bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
}

document.getElementById('form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  run(toolEl.value, JSON.parse(argsEl.value), darkEl.checked).catch((err) => log('ERROR', String(err)));
});

if (params.get('tool')) toolEl.value = params.get('tool')!;
if (params.get('args')) argsEl.value = params.get('args')!;
if (params.get('dark') === '1') darkEl.checked = true;
if (params.get('auto') === '1') {
  run(toolEl.value, JSON.parse(argsEl.value), darkEl.checked).catch((err) => log('ERROR', String(err)));
}
