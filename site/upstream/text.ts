/**
 * Word matching on normalized text (lower case, words separated by single
 * spaces). Shared by the MCP catalog search and the UniProt search.
 */

/** Whole-word match, or a prefix for words of 4+ letters ("hemoglobin" finds "hemoglobins"). */
function hasWord(haystack: string, token: string): boolean {
  const padded = ` ${haystack} `;
  if (padded.includes(` ${token} `)) return true;
  return token.length >= 4 && padded.includes(` ${token}`);
}

/** hasWord, or inside a longer word for 5+ letters ("hemoglobin" finds "deoxyhemoglobin"). */
export function hasPart(haystack: string, token: string): boolean {
  return hasWord(haystack, token) || (token.length >= 5 && haystack.includes(token));
}
