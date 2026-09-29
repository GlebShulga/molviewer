/**
 * Static pages generated at build time: tool pages, /about, /compare,
 * /learn/*, collection hubs and the small-molecule index. Returns
 * { path, html } pairs; site/build/generate.ts writes them to dist/.
 */
import type { ContentPage } from '../content/types';
import type { Collection, Compound } from '../dataTypes';
import { COMPOUND_CATEGORY_LABELS, type CompoundCategory } from '../dataTypes';
import { clean, escapeHtml } from '../render/html';
import { renderStaticDocument, type Crumb } from '../render/layout';
import { collectionHref, itemHref } from '../collections';
import { SITE_ORIGIN } from '../nav';

export interface GeneratedPage {
  path: string;
  html: string;
  /** For the sitemap. */
  lastmod?: string;
}

interface Ctx {
  cssHref: string;
  featured: Collection[];
}

const HOME: Crumb = { label: 'Home', href: '/' };

function faqJsonLd(page: ContentPage): object | null {
  if (!page.faq?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function pageJsonLd(page: ContentPage): object {
  const url = `${SITE_ORIGIN}${page.path}`;
  if (page.kind === 'learn') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.h1,
      description: page.description,
      url,
      dateModified: page.updated,
      author: { '@type': 'Person', name: 'Gleb Shulga' },
      publisher: { '@type': 'Organization', name: 'MolViewer', url: SITE_ORIGIN },
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': page.kind === 'about' ? 'AboutPage' : 'WebPage',
    name: page.title,
    description: page.description,
    url,
    dateModified: page.updated,
  };
}

function crumbsFor(page: ContentPage): Crumb[] {
  if (page.kind === 'learn') return [HOME, { label: 'Learn', href: '/learn' }, { label: page.h1, href: page.path }];
  return [HOME, { label: page.h1, href: page.path }];
}

export function renderContentPage(page: ContentPage, ctx: Ctx): GeneratedPage {
  const faq = page.faq?.length
    ? `<h2 id="faq">Frequently asked questions</h2><dl class="faq">${page.faq
        .map((f) => `<dt>${escapeHtml(f.q)}</dt><dd>${escapeHtml(f.a)}</dd>`)
        .join('')}</dl>`
    : '';
  const cta = page.cta
    ? `<p class="cta-row"><a class="cta" href="${escapeHtml(page.cta.href)}">${escapeHtml(page.cta.label)}</a></p>`
    : '';
  const screenshot = page.screenshot
    ? `<figure class="screenshot"><img src="${escapeHtml(page.screenshot.src)}" alt="${escapeHtml(page.screenshot.alt)}" width="${page.screenshot.width}" height="${page.screenshot.height}" loading="lazy" decoding="async"><figcaption>${escapeHtml(page.screenshot.alt)}</figcaption></figure>`
    : '';
  const related = page.related?.length
    ? `<h2>Related</h2><ul class="link-list">${page.related
        .map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`)
        .join('')}</ul>`
    : '';
  const sections = page.sections.map((s) => `<h2>${escapeHtml(s.heading)}</h2>\n${s.html}`).join('\n');
  const updated = page.kind === 'learn' ? `<p class="note">Updated ${escapeHtml(page.updated)}</p>` : '';

  const mainHtml = `<h1>${escapeHtml(page.h1)}</h1>
<div class="lead">${page.intro}</div>
${cta}
${screenshot}
${sections}
${faq}
${cta}
${related}
${updated}`;

  const jsonLd = [pageJsonLd(page), faqJsonLd(page)].filter((x): x is object => x !== null);
  return {
    path: page.path,
    lastmod: page.updated,
    html: renderStaticDocument({
      path: page.path,
      title: page.title,
      description: page.description,
      mainHtml,
      cssHref: ctx.cssHref,
      jsonLd,
      breadcrumbs: crumbsFor(page),
      footerCollections: ctx.featured,
    }),
  };
}

export function renderLearnIndex(pages: ContentPage[], ctx: Ctx): GeneratedPage {
  const learn = pages.filter((p) => p.kind === 'learn');
  const list = learn
    .map((p) => `<li><a href="${escapeHtml(p.path)}">${escapeHtml(p.h1)}</a><br><span class="note">${escapeHtml(p.description)}</span></li>`)
    .join('');
  return {
    path: '/learn',
    lastmod: learn.map((p) => p.updated).sort().pop(),
    html: renderStaticDocument({
      path: '/learn',
      title: 'Learn: protein structure basics | MolViewer',
      description:
        'Short, clear guides to reading PDB files, helices and β-sheets, AlphaFold models and pLDDT confidence, with live 3D examples you can open in your browser.',
      mainHtml: `<h1>Learn structural biology basics</h1>
<p class="lead">Short guides for students and teachers. Every article links to live 3D examples you can rotate and measure.</p>
<ul>${list}</ul>`,
      cssHref: ctx.cssHref,
      breadcrumbs: [HOME, { label: 'Learn', href: '/learn' }],
      footerCollections: ctx.featured,
    }),
  };
}

function collectionTitle(c: Collection): string {
  const full = `${c.title}: ${c.items.length} structures in 3D | MolViewer`;
  return full.length <= 70 ? full : `${c.title} in 3D | MolViewer`;
}

export function renderCollectionPage(c: Collection, all: Collection[], ctx: Ctx, lastmodById: Map<string, string>): GeneratedPage {
  const items = c.items
    .map(
      (i) =>
        `<li><a href="${itemHref(i)}">${escapeHtml(i.label)}</a><span class="item-id">${escapeHtml(i.id)}${i.type === 'af' ? ' (AlphaFold)' : ''}</span>${i.note ? `<br><span class="note">${escapeHtml(i.note)}</span>` : ''}</li>`
    )
    .join('');
  const others = all
    .filter((o) => o.slug !== c.slug)
    .map((o) => `<li><a href="${collectionHref(o)}">${escapeHtml(o.title)}</a></li>`)
    .join('');
  const first = c.items[0];
  const path = collectionHref(c);
  const lastmod = c.items.map((i) => lastmodById.get(i.id)).filter((d): d is string => !!d).sort().pop();

  return {
    path,
    lastmod,
    html: renderStaticDocument({
      path,
      title: collectionTitle(c),
      description: clean(c.intro, 160),
      mainHtml: `<h1>${escapeHtml(c.title)}</h1>
<p class="lead">${escapeHtml(c.intro)}</p>
${first ? `<p class="cta-row"><a class="cta" href="${itemHref(first)}">Open ${escapeHtml(first.label)} in 3D</a></p>` : ''}
<h2>${c.items.length} structures</h2>
<ul class="collection-items">${items}</ul>
<h2>More collections</h2>
<ul class="link-list">${others}</ul>`,
      cssHref: ctx.cssHref,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: c.title,
          description: c.intro,
          url: `${SITE_ORIGIN}${path}`,
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: c.items.length,
            itemListElement: c.items.map((i, n) => ({
              '@type': 'ListItem',
              position: n + 1,
              name: i.label,
              url: `${SITE_ORIGIN}${itemHref(i)}`,
            })),
          },
        },
      ],
      breadcrumbs: [HOME, { label: 'Collections', href: '/collections' }, { label: c.title, href: path }],
      footerCollections: ctx.featured,
    }),
  };
}

export function renderCollectionsIndex(all: Collection[], ctx: Ctx): GeneratedPage {
  const cards = all
    .map(
      (c) => `<section class="topic"><h3><a href="${collectionHref(c)}">${escapeHtml(c.title)}</a></h3><p class="note">${escapeHtml(c.intro)}</p><a class="more" href="${collectionHref(c)}">${c.items.length} structures</a></section>`
    )
    .join('\n');
  return {
    path: '/collections',
    html: renderStaticDocument({
      path: '/collections',
      title: 'Protein structure collections by topic | MolViewer',
      description:
        'Curated collections of famous protein, DNA and AlphaFold structures by topic, from hemoglobin and insulin to SARS-CoV-2, antibodies and ion channels. View each in 3D.',
      mainHtml: `<h1>Structure collections</h1>
<p class="lead">Hand-picked structures grouped by topic, for teaching, learning and exploring. Every entry opens in the 3D viewer.</p>
<div class="topic-grid">${cards}</div>`,
      cssHref: ctx.cssHref,
      breadcrumbs: [HOME, { label: 'Collections', href: '/collections' }],
      footerCollections: ctx.featured,
    }),
  };
}

export function renderCompoundsIndex(compounds: Compound[], ctx: Ctx): GeneratedPage {
  const byCategory = new Map<CompoundCategory, Compound[]>();
  for (const c of compounds) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  const categories = [...byCategory.entries()].sort((a, b) =>
    COMPOUND_CATEGORY_LABELS[a[0]].localeCompare(COMPOUND_CATEGORY_LABELS[b[0]])
  );
  const toc = categories
    .map(([cat, list]) => `<li><a href="#${cat}">${escapeHtml(COMPOUND_CATEGORY_LABELS[cat])}</a> <span class="note">(${list.length})</span></li>`)
    .join('');
  const sections = categories
    .map(
      ([cat, list]) =>
        `<h2 id="${cat}">${escapeHtml(COMPOUND_CATEGORY_LABELS[cat])}</h2><ul class="link-list">${list
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => `<li><a href="/compound/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a></li>`)
          .join('')}</ul>`
    )
    .join('\n');
  return {
    path: '/compounds',
    html: renderStaticDocument({
      path: '/compounds',
      title: 'Small molecules in 3D: drugs, vitamins, amino acids | MolViewer',
      description: `Interactive 3D models of ${compounds.length} small molecules: common drugs, vitamins, amino acids, neurotransmitters, sugars and school chemistry. Free in your browser.`,
      mainHtml: `<h1>Small molecules in 3D</h1>
<p class="lead">${compounds.length} molecules with 3D coordinates from PubChem. Open any of them to rotate the model, switch to space-filling view and measure bond lengths and angles. You can also type any compound name into the PubChem box in the viewer.</p>
<ul class="link-list">${toc}</ul>
${sections}`,
      cssHref: ctx.cssHref,
      breadcrumbs: [HOME, { label: 'Small molecules', href: '/compounds' }],
      footerCollections: ctx.featured,
    }),
  };
}
