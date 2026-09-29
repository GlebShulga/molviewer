/**
 * Tiny HTML helpers shared by Pages Functions (landing pages) and the
 * build-time static page generator. No dependencies, no DOM.
 */

/** Escape a string for safe interpolation into HTML text content or attributes. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse whitespace and truncate external strings before injection. */
export function clean(s: string, max = 280): string {
  const collapsed = s.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  // Cut at a word boundary when one is reasonably close, and mark the cut.
  const cut = collapsed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Serialize JSON for embedding inside a <script> element. Escapes `<` so a
 * string containing `</script>` can't close the element early.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Format a number with thousands separators (en-US). */
export function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}
