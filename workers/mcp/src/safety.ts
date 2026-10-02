/**
 * Compounds the app won't look up or show: chemical warfare agents on
 * Schedule 1 of the Chemical Weapons Convention. The website still has its
 * own pages for the ones in the catalog; this only applies to the chat app,
 * where a lookup could be one step of a harmful request.
 *
 * Matching uses PubChem CIDs (looked up 2026-10-02) and names, so a request
 * by synonym, slug or CID is caught either way. Educational toxins that are
 * not Schedule 1 (tetrodotoxin, strychnine, ...) stay available, and so do
 * protein toxins in the PDB (ricin is a protein structure, not a compound).
 */

const DENIED_CIDS = new Set<number>([
  7871, // sarin (GB)
  7305, // soman (GD)
  6500, // tabun (GA)
  64505, // cyclosarin (GF)
  39793, // VX
  178033, // VR
  132472361, // A-234 (Novichok)
  139033607, // A-234 (Novichok), second record
  10461, // sulfur mustard (HD)
  19092, // sesquimustard (Q)
  45452, // O-mustard (T)
  10848, // nitrogen mustard HN1
  4033, // nitrogen mustard HN2 (mechlorethamine)
  5561, // nitrogen mustard HN3
  10923, // lewisite 1
  5368106, // lewisite 2
  5352143, // lewisite 3
  56947150, // saxitoxin
]);

const DENIED_NAMES =
  /\b(sarin|soman|tabun|cyclosarin|novichoks?|a-?23[024]|vx|vr|sulfur mustard|sulphur mustard|mustard gas|sesquimustard|o-mustard|nitrogen mustard|hn-?[123]|mechlorethamine|lewisites?|saxitoxin)\b/i;

export const REFUSAL_MESSAGE =
  'MolViewer does not look up chemical warfare agents (Chemical Weapons Convention Schedule 1). ' +
  'It can show other compounds, proteins and nucleic acids.';

export function isDeniedCompound(ref: { cid?: number; names?: (string | undefined)[] }): boolean {
  if (ref.cid !== undefined && DENIED_CIDS.has(ref.cid)) return true;
  return (ref.names ?? []).some((n) => !!n && DENIED_NAMES.test(n));
}

/** True when a free-text query asks for a denied agent by name. */
export function isDeniedQuery(query: string): boolean {
  return DENIED_NAMES.test(query);
}
