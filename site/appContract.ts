/**
 * Contract between the MCP server (workers/mcp) and the chat widget
 * (src/widget): the tool vocabulary, the widget payload the render tool sends
 * in `_meta`, and the widget's asset URLs. Lives in site/ because both sides
 * import it; it has no runtime dependencies.
 */
import { SITE_ORIGIN } from './nav';

/** Bump to `-v2` (and the asset folder) only for breaking widget changes: hosts cache by this URI. */
export const WIDGET_RESOURCE_URI = 'ui://molviewer/viewer-v1.html';
export const WIDGET_ASSET_PATH = '/widget/v1';

/** Key of the widget payload in a tool result's `_meta` (hidden from the model). */
export const WIDGET_META_KEY = 'molviewer/widget';

export type AppKind = 'pdb' | 'alphafold' | 'compound';

/** Styles the model can ask for, mapped onto the viewer's representations. */
export const APP_STYLES = ['cartoon', 'ball-and-stick', 'stick', 'spacefill', 'surface'] as const;
export type AppStyle = (typeof APP_STYLES)[number];

/** Colors the model can ask for. `confidence` is AlphaFold pLDDT (stored as B-factor). */
export const APP_COLORS = [
  'secondaryStructure',
  'chain',
  'cpk',
  'residueType',
  'bfactor',
  'confidence',
  'rainbow',
] as const;
export type AppColor = (typeof APP_COLORS)[number];

/** The viewer's own values (src/types/multiStructure.ts), repeated so site/ stays independent of src/. */
export type ViewerRepresentation = 'ball-and-stick' | 'stick' | 'spacefill' | 'cartoon' | 'surface-vdw' | 'surface-sas';
export type ViewerColorScheme = 'cpk' | 'chain' | 'residueType' | 'bfactor' | 'rainbow' | 'secondaryStructure';

/** What the widget loads, as the viewer's StructureSource understands it. */
export type WidgetLoad =
  | { kind: 'pdb'; id: string }
  | { kind: 'alphafold'; id: string }
  | { kind: 'compound'; cid: number; slug?: string };

export interface WidgetView {
  repr: ViewerRepresentation;
  color: ViewerColorScheme;
  spin: boolean;
}

export interface WidgetPayload {
  load: WidgetLoad;
  view: WidgetView;
  /** Display title, e.g. "4HHB: Deoxy human hemoglobin". */
  title: string;
  /**
   * One line of key facts shown in the viewer, e.g.
   * "Caffeine · C8H10N4O2 · 194.19 g/mol · stimulants". ChatGPT often writes no
   * text after the viewer, so the essentials live in the picture too.
   * Optional: older servers don't send it (the widget falls back to `title`).
   */
  caption?: string;
  /** Canonical page on molviewer.bio, without view or tracking parameters. */
  pageUrl: string;
}

export function toViewerRepresentation(style: AppStyle): ViewerRepresentation {
  return style === 'surface' ? 'surface-vdw' : style;
}

export function toViewerColor(color: AppColor): ViewerColorScheme {
  return color === 'confidence' ? 'bfactor' : color;
}

/** Default view when the model doesn't ask for one. */
export function defaultView(kind: AppKind): { style: AppStyle; color: AppColor } {
  switch (kind) {
    case 'pdb':
      return { style: 'cartoon', color: 'chain' };
    case 'alphafold':
      return { style: 'cartoon', color: 'confidence' };
    case 'compound':
      return { style: 'ball-and-stick', color: 'cpk' };
  }
}

/**
 * "Open in MolViewer" link: the canonical page plus the current view and
 * tracking parameters. `host` is the chat client, e.g. "chatgpt" or "claude".
 */
export function openInMolViewerUrl(payload: Pick<WidgetPayload, 'pageUrl'>, view: Pick<WidgetView, 'repr' | 'color'>, host: string): string {
  const url = new URL(payload.pageUrl, SITE_ORIGIN);
  url.searchParams.set('repr', view.repr);
  url.searchParams.set('color', view.color);
  url.searchParams.set('utm_source', host || 'mcp');
  url.searchParams.set('utm_medium', 'app');
  return url.toString();
}

/** Narrow an unknown `_meta` value to a widget payload (the widget trusts nothing). */
export function readWidgetPayload(meta: unknown): WidgetPayload | null {
  if (!meta || typeof meta !== 'object') return null;
  const p = (meta as Record<string, unknown>)[WIDGET_META_KEY] as Partial<WidgetPayload> | undefined;
  if (!p || typeof p !== 'object' || !p.load || !p.view || typeof p.pageUrl !== 'string') return null;
  const load = p.load as Partial<WidgetLoad> & Record<string, unknown>;
  const okLoad =
    ((load.kind === 'pdb' || load.kind === 'alphafold') && typeof load.id === 'string') ||
    (load.kind === 'compound' && typeof load.cid === 'number');
  return okLoad ? (p as WidgetPayload) : null;
}
