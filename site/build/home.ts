/**
 * The home page's #page-info: the page's only H1 (visually hidden, because the
 * welcome screen inside the viewer carries the visible heading) and the site
 * footer, whose Topics column links the featured collection hubs. Injected
 * into index.html at build (and in dev) by site/build/vitePlugin.ts.
 */
import { FEATURED_COLLECTIONS } from '../collections';
import { renderFooter } from '../nav';

export function renderHomeContent(): string {
  return `<h1 class="visually-hidden">MolViewer: free online 3D molecule viewer</h1>
${renderFooter(FEATURED_COLLECTIONS)}`;
}
