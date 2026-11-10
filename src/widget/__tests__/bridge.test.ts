import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WIDGET_META_KEY } from '../../../site/appContract';

// Each App the bridge creates, so a test can deliver a tool result to it directly.
const mocks = vi.hoisted(() => ({ apps: [] as { ontoolresult?: (result: unknown) => void }[] }));

// No MCP Apps host: the handshake fails, so only ChatGPT's window.openai is left.
vi.mock('@modelcontextprotocol/ext-apps', () => ({
  App: class {
    ontoolresult?: (result: unknown) => void;
    onhostcontextchanged?: unknown;
    constructor() {
      mocks.apps.push(this);
    }
    connect() {
      return Promise.reject(new Error('no host'));
    }
    getHostVersion() {
      return undefined;
    }
  },
  PostMessageTransport: class {},
}));

const { connectHost } = await import('../bridge');

const payload = {
  load: { kind: 'pdb', id: '4HHB' },
  view: { repr: 'cartoon', color: 'chain', spin: false },
  title: '4HHB',
  pageUrl: 'https://molviewer.bio/pdb/4HHB',
};

describe('window.openai fallback', () => {
  // Each connectHost() adds a window listener for its lifetime; remove them so
  // an earlier test's bridge doesn't react to a later test's events.
  let added: [string, EventListenerOrEventListenerObject][] = [];
  beforeEach(() => {
    window.openai = {};
    added = [];
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      added.push([type, handler]);
      add(type, handler, options);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    added.forEach(([type, handler]) => window.removeEventListener(type, handler));
    delete window.openai;
  });

  function listen() {
    const bridge = connectHost();
    const errors: string[] = [];
    const payloads: unknown[] = [];
    bridge.onToolError((m) => errors.push(m));
    bridge.onPayload((p) => payloads.push(p));
    return { errors, payloads };
  }

  it('shows the error of a result that is already there', () => {
    window.openai!.toolResponseMetadata = { [WIDGET_META_KEY]: { error: 'No PDB entry "ZZZ9".' } };
    const { errors, payloads } = listen();
    expect(errors).toEqual(['No PDB entry "ZZZ9".']);
    expect(payloads).toEqual([]);
  });

  it('shows an error that arrives with a globals update', () => {
    const { errors } = listen();
    expect(errors).toEqual([]);
    window.openai!.toolResponseMetadata = { [WIDGET_META_KEY]: { error: 'MolViewer is busy.' } };
    window.dispatchEvent(new Event('openai:set_globals'));
    expect(errors).toEqual(['MolViewer is busy.']);
  });

  it('keeps waiting while there is no metadata', () => {
    const { errors, payloads } = listen();
    window.dispatchEvent(new Event('openai:set_globals'));
    expect(errors).toEqual([]);
    expect(payloads).toEqual([]);
  });

  it('shows the same error again after a structure loaded in between', () => {
    const { errors, payloads } = listen();
    const app = mocks.apps.at(-1)!;
    const failed = { content: [{ type: 'text', text: 'No PDB entry "ZZZ9".' }] };
    app.ontoolresult!(failed);
    app.ontoolresult!({ content: [], _meta: { [WIDGET_META_KEY]: payload } });
    app.ontoolresult!(failed);
    expect(payloads).toEqual([payload]);
    expect(errors).toEqual(['No PDB entry "ZZZ9".', 'No PDB entry "ZZZ9".']);
  });

  it('still loads a structure', () => {
    window.openai!.toolResponseMetadata = { [WIDGET_META_KEY]: payload };
    const { errors, payloads } = listen();
    expect(payloads).toEqual([payload]);
    expect(errors).toEqual([]);
  });
});
