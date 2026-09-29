/**
 * Full HTML documents for static pages generated at build time (tool pages,
 * collections, compounds index, learn articles). They don't load the React
 * app: plain HTML + the app's CSS bundle, so they're fast and crawlable.
 */
import { escapeHtml, jsonForScript } from './html';
import { SITE_NAME, SITE_ORIGIN, TOOL_LINKS, renderFooter } from '../nav';

export interface Crumb {
  label: string;
  href: string;
}

export interface StaticDocument {
  /** Root-relative path, e.g. `/pdb-viewer`. */
  path: string;
  title: string;
  description: string;
  /** Inner HTML of <main>. */
  mainHtml: string;
  /** href of the built CSS bundle, e.g. `/assets/index-abc.css`. */
  cssHref: string;
  jsonLd?: object[];
  breadcrumbs?: Crumb[];
  robots?: string;
  ogImageUrl?: string;
  footerCollections?: { slug: string; title: string }[];
}

const ANALYTICS_SNIPPET =
  `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "a3389c7a6f424ecaaf63057532dc0e1b"}'></script>`;

export function breadcrumbJsonLd(crumbs: Crumb[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: `${SITE_ORIGIN}${c.href}`,
    })),
  };
}

export function renderBreadcrumbs(crumbs: Crumb[]): string {
  const items = crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<li aria-current="page">${escapeHtml(c.label)}</li>`
        : `<li><a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a></li>`
    )
    .join('');
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

export function renderStaticDocument(doc: StaticDocument): string {
  const canonical = `${SITE_ORIGIN}${doc.path}`;
  const ogImage = doc.ogImageUrl ?? `${SITE_ORIGIN}/og-image.png`;
  const jsonLd = [...(doc.jsonLd ?? [])];
  if (doc.breadcrumbs?.length) jsonLd.push(breadcrumbJsonLd(doc.breadcrumbs));
  const t = escapeHtml(doc.title);
  const d = escapeHtml(doc.description);
  const nav = [
    { label: 'Open viewer', href: '/' },
    TOOL_LINKS[0],
    { label: 'Collections', href: '/collections' },
    { label: 'Small molecules', href: '/compounds' },
    { label: 'Learn', href: '/learn' },
  ]
    .map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script src="/theme-init.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t}</title>
<meta name="description" content="${d}">
<meta name="robots" content="${escapeHtml(doc.robots ?? 'index, follow')}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0d1117">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<link rel="stylesheet" href="${escapeHtml(doc.cssHref)}">
${jsonLd.map((j) => `<script type="application/ld+json">${jsonForScript(j)}</script>`).join('\n')}
</head>
<body class="static-page">
<div class="static-header"><div class="static-header-inner"><a class="static-brand" href="/">MolViewer</a><nav class="static-nav" aria-label="Main">${nav}</nav></div></div>
<main>
${doc.breadcrumbs?.length ? renderBreadcrumbs(doc.breadcrumbs) : ''}
${doc.mainHtml}
</main>
${renderFooter(doc.footerCollections ?? [])}
${ANALYTICS_SNIPPET}
</body>
</html>
`;
}
