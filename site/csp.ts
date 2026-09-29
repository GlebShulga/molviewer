/**
 * Content-Security-Policy, sent as an HTTP header by functions/_middleware.ts.
 *
 * It lives here rather than in a <meta> tag or public/_headers because:
 * - a <meta> CSP can't set `frame-ancestors`, which embed mode needs per route;
 * - Cloudflare Pages doesn't apply `_headers` to responses produced by
 *   Functions, and the landing pages (/pdb/:id, /af/:id, /s/:id, /embed/*)
 *   are Functions. The middleware sees every HTML response, static or not.
 */

const BASE_DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  // Cloudflare Web Analytics beacon (the hard-coded snippet in index.html).
  'script-src': "'self' https://static.cloudflareinsights.com",
  'style-src': "'self' 'unsafe-inline'",
  'connect-src': [
    "'self'",
    'https://files.rcsb.org',
    'https://data.rcsb.org',
    'https://alphafold.ebi.ac.uk',
    'https://pubchem.ncbi.nlm.nih.gov',
    'https://log-api.eu.newrelic.com',
    'https://cloudflareinsights.com',
  ].join(' '),
  'img-src': "'self' data: blob:",
  'worker-src': 'blob:',
  'font-src': "'self'",
};

export type CspMode = 'default' | 'embed';

export function buildCsp(mode: CspMode = 'default'): string {
  const directives = {
    ...BASE_DIRECTIVES,
    // Embeds may be framed by any site; everything else only by ourselves.
    'frame-ancestors': mode === 'embed' ? '*' : "'self'",
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');
}
