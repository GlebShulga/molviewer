/**
 * Cloudflare Web Analytics (page views), on molviewer.bio only: preview
 * deployments and local runs stay out of its numbers. A file rather than an
 * inline tag because the CSP blocks inline scripts. Loaded with `defer` from
 * index.html (the app and its landing pages) and site/render/layout.ts
 * (static pages), so it starts early on both.
 */
(function () {
  if (location.hostname !== 'molviewer.bio') return;
  var beacon = document.createElement('script');
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', '{"token": "a3389c7a6f424ecaaf63057532dc0e1b"}');
  document.head.appendChild(beacon);
})();
