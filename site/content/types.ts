/**
 * Content model for static, crawlable pages (tool pages, /about, /compare,
 * /learn/*). Pages are pre-rendered to HTML at build time by
 * `site/build/staticPages.ts`, so they cost no Functions invocations.
 */

export interface ContentLink {
  label: string;
  href: string;
}

export interface ContentSection {
  heading: string;
  /**
   * Trusted HTML authored in this repo. Allowed tags: p, ul, ol, li, a,
   * strong, em, code, table/thead/tbody/tr/th/td, figure/figcaption, img.
   * Internal links are root-relative (`/pdb/4HHB`), external links absolute.
   */
  html: string;
}

export interface FaqItem {
  q: string;
  /** Plain text: also emitted verbatim in the FAQPage JSON-LD. */
  a: string;
}

export interface ContentPage {
  /** Root-relative path without trailing slash, e.g. `/pdb-viewer`. */
  path: string;
  /** Document <title>, at most ~60 characters, ends with "| MolViewer". */
  title: string;
  /** Meta description, 140-160 characters, written for people. */
  description: string;
  h1: string;
  /** Lead paragraph(s) as trusted HTML. */
  intro: string;
  sections: ContentSection[];
  faq?: FaqItem[];
  /** Primary call to action, usually opens the viewer with a structure preloaded. */
  cta?: ContentLink;
  /** Screenshot under `public/screenshots/`, e.g. `/screenshots/pdb-viewer.png`. */
  screenshot?: { src: string; alt: string; width: number; height: number };
  /** Links to collections, other tool pages and articles. */
  related?: ContentLink[];
  /** ISO date of the last substantive edit. */
  updated: string;
  /** Which section of the site the page belongs to (drives breadcrumbs and the sitemap). */
  kind: 'tool' | 'learn' | 'about';
}
