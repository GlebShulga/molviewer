/**
 * Rewrites the SPA shell (index.html) into a landing page: per-page title,
 * description, canonical, social tags, JSON-LD, the visible #page-info
 * content and the #landing-data JSON for the React app.
 *
 * Plain string replacement on a document we control. Used by the Pages
 * Functions (/pdb/:id, /af/:id, /s/:id, /embed/*) and by the build step that
 * pre-renders /compound/:slug pages, so both share one tested code path.
 */
import { SHELL_MARKER } from '../routing';
import { escapeHtml, jsonForScript } from './html';
import { LANDING_DATA_ELEMENT_ID, type LandingData } from '../landingData';

/**
 * The #page-info content sits between these comments. The content contains
 * nested <section> elements, so it can't be delimited by the closing tag.
 */
export const PAGE_INFO_EMPTY = '<!--page-info:start--><!--page-info:end-->';

export function pageInfoBlock(html: string): string {
  return `<!--page-info:start-->\n${html}\n<!--page-info:end-->`;
}

export interface ShellMeta {
  title: string;
  description: string;
  /** Absolute canonical URL, or null to drop the canonical link. */
  canonicalUrl: string | null;
  /** Absolute OG/Twitter image URL; defaults to the site image. */
  ogImageUrl?: string;
  /** Robots directive; defaults to "index, follow". */
  robots?: string;
  /** Replaces the default WebApplication JSON-LD. */
  jsonLd?: object | object[];
  /** Inner HTML for <section id="page-info">. Omit to keep the shell's content. */
  pageInfoHtml?: string;
  /** Hide the #page-info section entirely (embeds). */
  hidePageInfo?: boolean;
  landingData?: LandingData;
  /** Extra tags appended to <head>, e.g. the oEmbed discovery link. Trusted HTML. */
  extraHead?: string;
}

/**
 * All replacements below use function replacers: upstream text (titles,
 * citations, PubChem names) may contain `$&`, `$'` or `$\``, which a string
 * replacement would expand into other parts of the document.
 */
function setMetaContent(html: string, attr: 'name' | 'property', key: string, value: string): string {
  const re = new RegExp(`(<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content=")[^"]*(")`);
  const escaped = escapeHtml(value);
  return html.replace(re, (_m, open: string, close: string) => `${open}${escaped}${close}`);
}

export function applyShellMeta(html: string, meta: ShellMeta): string {
  let out = html.replace(SHELL_MARKER, '');

  const title = `<title>${escapeHtml(meta.title)}</title>`;
  out = out.replace(/<title>[^<]*<\/title>/, () => title);
  out = setMetaContent(out, 'name', 'description', meta.description);
  out = setMetaContent(out, 'name', 'robots', meta.robots ?? 'index, follow');

  if (meta.canonicalUrl) {
    const canonical = escapeHtml(meta.canonicalUrl);
    out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, (_m, open: string, close: string) => `${open}${canonical}${close}`);
    out = setMetaContent(out, 'property', 'og:url', meta.canonicalUrl);
  } else {
    out = out.replace(/\s*<link rel="canonical" href="[^"]*"\s*\/?>/, '');
    out = out.replace(/\s*<meta property="og:url" content="[^"]*">/, '');
  }

  out = setMetaContent(out, 'property', 'og:title', meta.title);
  out = setMetaContent(out, 'property', 'og:description', meta.description);
  out = setMetaContent(out, 'property', 'og:image:alt', meta.title);
  out = setMetaContent(out, 'name', 'twitter:title', meta.title);
  out = setMetaContent(out, 'name', 'twitter:description', meta.description);
  out = setMetaContent(out, 'name', 'twitter:image:alt', meta.title);
  if (meta.ogImageUrl) {
    out = setMetaContent(out, 'property', 'og:image', meta.ogImageUrl);
    out = setMetaContent(out, 'property', 'og:image:secure_url', meta.ogImageUrl);
    out = setMetaContent(out, 'name', 'twitter:image', meta.ogImageUrl);
  }

  if (meta.jsonLd) {
    const ld = `<script type="application/ld+json">${jsonForScript(meta.jsonLd)}</script>`;
    out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => ld);
  }

  if (meta.extraHead) {
    const head = `    ${meta.extraHead}\n  </head>`;
    out = out.replace('</head>', () => head);
  }

  if (meta.hidePageInfo) {
    out = out.replace(/<section id="page-info"[\s\S]*<!--page-info:end-->\s*<\/section>/, '');
  } else if (meta.pageInfoHtml !== undefined) {
    const block = pageInfoBlock(meta.pageInfoHtml);
    out = out.replace(/<!--page-info:start-->[\s\S]*<!--page-info:end-->/, () => block);
  }

  if (meta.landingData) {
    const script = `<script type="application/json" id="${LANDING_DATA_ELEMENT_ID}">${jsonForScript(meta.landingData)}</script>`;
    out = out.replace('<script type="module"', () => `${script}\n    <script type="module"`);
  }

  return out;
}
