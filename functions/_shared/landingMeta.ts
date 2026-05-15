/**
 * Shared HTMLRewriter helpers for /pdb/:id and /af/:id landing pages.
 * Both fetch metadata from upstream APIs and inject per-structure meta tags
 * into the static index.html, then hand off to the SPA.
 */

export interface LandingMeta {
  title: string;
  description: string;
  ogImageUrl: string;
  canonicalUrl: string;
  jsonLd: object;
  bodyHtml: string;
}

class MetaTagRewriter {
  constructor(private property: string, private value: string) {}

  element(element: Element) {
    element.setAttribute('content', this.value);
  }
}

class TitleRewriter {
  constructor(private title: string) {}

  element(element: Element) {
    element.setInnerContent(this.title);
  }
}

class CanonicalRewriter {
  constructor(private url: string) {}

  element(element: Element) {
    element.setAttribute('href', this.url);
  }
}

class JsonLdRewriter {
  constructor(private json: object) {}

  element(element: Element) {
    element.setInnerContent(JSON.stringify(this.json));
  }
}

class RootContentRewriter {
  constructor(private html: string) {}

  element(element: Element) {
    element.setInnerContent(this.html, { html: true });
  }
}

/** Escape a string for safe interpolation into HTML text content / innerHTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inject landing-page metadata into a Response containing index.html.
 * Uses Cloudflare's HTMLRewriter to mutate the response stream.
 */
export function applyLandingMeta(response: Response, meta: LandingMeta): Response {
  return new HTMLRewriter()
    .on('title', new TitleRewriter(meta.title))
    .on('link[rel="canonical"]', new CanonicalRewriter(meta.canonicalUrl))
    .on('meta[name="description"]', new MetaTagRewriter('description', meta.description))
    .on('meta[property="og:title"]', new MetaTagRewriter('og:title', meta.title))
    .on('meta[property="og:description"]', new MetaTagRewriter('og:description', meta.description))
    .on('meta[property="og:url"]', new MetaTagRewriter('og:url', meta.canonicalUrl))
    .on('meta[property="og:image"]', new MetaTagRewriter('og:image', meta.ogImageUrl))
    .on('meta[property="og:image:secure_url"]', new MetaTagRewriter('og:image:secure_url', meta.ogImageUrl))
    .on('meta[property="og:image:alt"]', new MetaTagRewriter('og:image:alt', meta.title))
    .on('meta[property="twitter:title"]', new MetaTagRewriter('twitter:title', meta.title))
    .on('meta[property="twitter:description"]', new MetaTagRewriter('twitter:description', meta.description))
    .on('meta[property="twitter:image"]', new MetaTagRewriter('twitter:image', meta.ogImageUrl))
    .on('meta[property="twitter:image:alt"]', new MetaTagRewriter('twitter:image:alt', meta.title))
    .on('script[type="application/ld+json"]', new JsonLdRewriter(meta.jsonLd))
    .on('div#root', new RootContentRewriter(meta.bodyHtml))
    .transform(response);
}

/** Sanitize external strings before injection (HTMLRewriter handles attribute escaping). */
export function clean(s: string, max = 280): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}
