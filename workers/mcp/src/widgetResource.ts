/**
 * The widget's HTML resource. It's tiny: the viewer is a static bundle on
 * molviewer.bio (built by vite.widget.config.ts into /widget/v1/), loaded
 * cross-origin by the host's sandboxed iframe.
 */
import { SITE_ORIGIN } from '../../../site/nav';
import { WIDGET_ASSET_PATH } from '../../../site/appContract';

/** Where the structure files come from (fetched by the widget, not the server). */
export const CONNECT_DOMAINS = [
  'https://files.rcsb.org',
  'https://data.rcsb.org',
  'https://alphafold.ebi.ac.uk',
  'https://pubchem.ncbi.nlm.nih.gov',
];

export interface WidgetResourceOptions {
  /** Origin serving /widget/v1/ (a preview deployment or localhost in development). */
  assetOrigin: string;
  /**
   * ChatGPT's dedicated widget origin (required for submission), e.g.
   * "https://molviewer.bio". Sent only as `openai/widgetDomain`: the standard
   * `_meta.ui.domain` is host-specific (Claude expects a different format),
   * so it's left for each host's default.
   */
  chatgptWidgetDomain?: string;
}

export function widgetHtml({ assetOrigin }: WidgetResourceOptions): string {
  const base = `${assetOrigin}${WIDGET_ASSET_PATH}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MolViewer</title>
<link rel="stylesheet" href="${base}/viewer.css">
<script type="module" src="${base}/viewer.js"></script>
</head>
<body>
<div id="root"></div>
</body>
</html>`;
}

export function widgetResourceMeta({ assetOrigin, chatgptWidgetDomain }: WidgetResourceOptions) {
  // The widget posts product events to molviewer.bio/api/event.
  const connectDomains = [...new Set([...CONNECT_DOMAINS, SITE_ORIGIN, assetOrigin])];
  const resourceDomains = [assetOrigin];
  return {
    ui: {
      csp: { connectDomains, resourceDomains },
      prefersBorder: true,
    },
    // ChatGPT: display modes, the dedicated origin, and the redirect allowlist
    // for "Open in MolViewer" (only the legacy CSP key has redirect_domains).
    'openai/ui': { availableDisplayModes: ['inline', 'fullscreen', 'pip'] },
    ...(chatgptWidgetDomain ? { 'openai/widgetDomain': chatgptWidgetDomain } : {}),
    'openai/widgetCSP': {
      connect_domains: connectDomains,
      resource_domains: resourceDomains,
      redirect_domains: [SITE_ORIGIN],
    },
    'openai/widgetDescription':
      'An interactive 3D viewer showing the requested structure. The user can rotate, zoom, change style and color, and open it on molviewer.bio. Explain the structure rather than describing the picture.',
  };
}
