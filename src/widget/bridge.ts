/**
 * Talks to the chat host. The standard MCP Apps client
 * (@modelcontextprotocol/ext-apps) is the main path, so the same widget works
 * in ChatGPT and Claude; `window.openai` (ChatGPT's own API) is only a
 * fallback when a standard call isn't available.
 */
import { App, PostMessageTransport, type McpUiDisplayMode, type McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { readWidgetPayload, type WidgetPayload } from '../../site/appContract';

/** The parts of ChatGPT's `window.openai` the widget uses (all optional: other hosts don't have it). */
interface OpenAiGlobals {
  theme?: 'light' | 'dark';
  displayMode?: McpUiDisplayMode;
  toolResponseMetadata?: Record<string, unknown> | null;
  requestDisplayMode?: (args: { mode: McpUiDisplayMode }) => Promise<{ mode: McpUiDisplayMode }>;
  openExternal?: (args: { href: string }) => void;
  /** Areas covered by ChatGPT's own controls (close button, composer), in px. */
  safeArea?: { insets?: Partial<SafeAreaInsets> } | null;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

declare global {
  interface Window {
    openai?: OpenAiGlobals;
  }
}

export interface HostSnapshot {
  theme: 'light' | 'dark';
  displayMode: McpUiDisplayMode;
  canFullscreen: boolean;
  /** Host-reported insets to keep our controls clear of the host's own (undefined when not reported). */
  safeArea?: SafeAreaInsets;
}

/** The host's safe-area insets: MCP Apps host context first, then ChatGPT's window.openai.safeArea. */
function safeAreaOf(context: McpUiHostContext): SafeAreaInsets | undefined {
  const raw = context.safeAreaInsets ?? window.openai?.safeArea?.insets;
  if (!raw) return undefined;
  const px = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  return { top: px(raw.top), right: px(raw.right), bottom: px(raw.bottom), left: px(raw.left) };
}

export interface HostBridge {
  /** Short client name for "Open in MolViewer" tracking, e.g. "chatgpt", "claude". */
  readonly hostName: string;
  snapshot(): HostSnapshot;
  onChange(cb: (s: HostSnapshot) => void): void;
  onPayload(cb: (p: WidgetPayload) => void): void;
  /** A tool result without a structure (e.g. "No PDB entry"), with the server's message. */
  onToolError(cb: (message: string) => void): void;
  requestDisplayMode(mode: McpUiDisplayMode): Promise<void>;
  openLink(url: string): Promise<void>;
}

function hostNameOf(app: App | null): string {
  const name = app?.getHostVersion()?.name?.toLowerCase() ?? '';
  if (/chatgpt|openai/.test(name) || window.openai) return 'chatgpt';
  if (/claude|anthropic/.test(name)) return 'claude';
  return name.replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'mcp';
}

/**
 * Returns at once so the widget renders immediately; the MCP Apps handshake
 * runs in the background. On ChatGPT the result may already be waiting in
 * window.openai, so a host without the standard bridge never shows a blank frame.
 */
export function connectHost(): HostBridge {
  const app = new App({ name: 'MolViewer', version: '1.0.0' }, { availableDisplayModes: ['inline', 'fullscreen', 'pip'] });
  let context: McpUiHostContext = {};
  let payload: WidgetPayload | null = null;
  const payloadListeners: ((p: WidgetPayload) => void)[] = [];
  const changeListeners: ((s: HostSnapshot) => void)[] = [];
  const errorListeners: ((message: string) => void)[] = [];
  let toolError: string | null = null;

  const emitPayload = (p: WidgetPayload | null) => {
    // The same result can arrive twice (MCP Apps notification and window.openai): load it once.
    if (!p || (payload && JSON.stringify(payload) === JSON.stringify(p))) return;
    payload = p;
    payloadListeners.forEach((cb) => cb(p));
  };
  const snapshot = (): HostSnapshot => {
    const modes = context.availableDisplayModes;
    return {
      theme: context.theme ?? window.openai?.theme ?? 'light',
      displayMode: context.displayMode ?? window.openai?.displayMode ?? 'inline',
      canFullscreen: modes ? modes.includes('fullscreen') : !!window.openai?.requestDisplayMode,
      safeArea: safeAreaOf(context),
    };
  };
  const emitChange = () => changeListeners.forEach((cb) => cb(snapshot()));

  // Handlers go in before connecting: the tool result can arrive right after the handshake.
  app.ontoolresult = (result) => {
    const p = readWidgetPayload(result._meta);
    if (p) return emitPayload(p);
    const text = result.content?.find((c) => c.type === 'text');
    toolError = text && 'text' in text ? text.text : 'MolViewer could not show this structure.';
    errorListeners.forEach((cb) => cb(toolError!));
  };
  app.onhostcontextchanged = (changes) => {
    context = { ...context, ...changes };
    emitChange();
  };

  let connected = false;
  app
    .connect(new PostMessageTransport(window.parent, window.parent))
    .then(() => {
      connected = true;
      context = { ...app.getHostContext(), ...context };
      emitChange();
    })
    .catch(() => {
      // No MCP Apps host (or an old one): window.openai alone.
    });

  // ChatGPT fallback: the result may already be in window.openai, or arrive with a globals update.
  emitPayload(readWidgetPayload(window.openai?.toolResponseMetadata));
  window.addEventListener('openai:set_globals', () => {
    if (!payload) emitPayload(readWidgetPayload(window.openai?.toolResponseMetadata));
    emitChange();
  });

  return {
    // Read when needed: the handshake (which names the host) may finish after render.
    get hostName() {
      return hostNameOf(connected ? app : null);
    },
    snapshot,
    onChange: (cb) => changeListeners.push(cb),
    onPayload: (cb) => {
      payloadListeners.push(cb);
      if (payload) cb(payload);
    },
    onToolError: (cb) => {
      errorListeners.push(cb);
      if (toolError) cb(toolError);
    },
    async requestDisplayMode(mode) {
      try {
        if (connected && context.availableDisplayModes?.includes(mode)) {
          const r = await app.requestDisplayMode({ mode });
          context = { ...context, displayMode: r.mode };
        } else if (window.openai?.requestDisplayMode) {
          const r = await window.openai.requestDisplayMode({ mode });
          context = { ...context, displayMode: r?.mode ?? mode };
        }
      } catch {
        // The host may refuse (e.g. PiP on mobile); the view just stays as it is.
      }
      emitChange();
    },
    async openLink(url) {
      try {
        if (connected && app.getHostCapabilities()?.openLinks) {
          await app.openLink({ url });
          return;
        }
      } catch {
        // Fall through to the next option.
      }
      if (window.openai?.openExternal) window.openai.openExternal({ href: url });
      else window.open(url, '_blank', 'noopener');
    },
  };
}
