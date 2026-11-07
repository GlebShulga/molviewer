/**
 * Compounds the app won't look up or show: chemical warfare agents on
 * Schedule 1 of the Chemical Weapons Convention. The website still has its
 * own pages for the ones in the catalog; this only applies to the chat app,
 * where a lookup could be one step of a harmful request.
 *
 * Matching uses PubChem CIDs (looked up 2026-10-02 and 2026-11-07, each
 * checked by its PubChem title) and names, so a request by synonym, slug or
 * CID is caught either way.
 *
 * Covered: the agents and precursors Schedule 1 names individually (1A and
 * 1B, including the 2020 additions). Families the Schedule defines only by
 * structure (for example every O-alkyl phosphonofluoridate) are covered for
 * the members listed here, not in general. Ricin is excluded on purpose: it
 * is a protein structure in the PDB, not a compound, and stays viewable, as
 * do educational toxins outside Schedule 1 (tetrodotoxin, strychnine, ...).
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
  65568, // VE
  30800, // VM
  14557887, // 2-chloroethylchloromethylsulfide
  522107, // bis(2-chloroethylthio)methane
  522108, // 1,3-bis(2-chloroethylthio)-n-propane
  518918, // 1,4-bis(2-chloroethylthio)-n-butane
  22608774, // 1,5-bis(2-chloroethylthio)-n-pentane
  22608780, // bis(2-chloroethylthiomethyl)ether
  160100773, // A-230
  157299938, // A-232
  146586254, // A-242
  165365087, // carbamate (2020): 1,10-bis[N-(3-dimethylcarbamoxy-α-picolyl)-N-ethyl-N-methylammonio]decane-2,9-dione dibromide
  165365088, // the same, as the dication
  165365094, // carbamate (2020): 1-[N,N-dimethyl-N-(2-hydroxy)ethylammonio]-10-[N-(3-dimethylcarbamoxy-α-picolinyl)-N,N-dimethylammonio]decane dibromide
  165365095, // the same, as the dication
  69610, // DF (methylphosphonyl difluoride)
  170325, // QL
  102124, // chlorosarin
  145983, // chlorosoman
]);

/**
 * Short names, matched as whole words (after `normalizeDashes`). Codes that
 * collide with ordinary notation are narrowed: A-230 to A-242 need the hyphen
 * (A242 is residue notation, as in "T4 lysozyme A242"), and VX and VR must not
 * be part of a drug or receptor code (VX-770 is ivacaftor, VR-1 a receptor).
 * Only a hyphen or nothing makes a code: "VX 10 mg" is still VX. HN-1 to
 * HN-3 stay as they are: that is how the nitrogen mustards are written.
 */
const DENIED_NAMES =
  /\b(sarin|soman|tabun|cyclosarin|chlorosarin|chlorosoman|novichoks?|a-23[024]|a-242|vx(?!-?\d)|vr(?!-?\d)|agent[\s-]*ql|sulfur mustard|sulphur mustard|mustard gas|sesquimustard|o-mustard|nitrogen mustard|hn-?[123]|mechlorethamine|lewisites?|saxitoxin)\b/i;

/**
 * Full chemical names. People write these with varying brackets, spaces,
 * hyphens, locant prefixes (S-, O-, P-, n-) and substituent order, and
 * PubChem writes "sulfanyl" where older names say "thio", so both sides are
 * compacted (see `compactName`) and matched as substrings; each order in use
 * is listed. Bare codes such as VE, VM, DF or QL are deliberately absent:
 * they would match VE-cadherin or DF-1.
 */
const DENIED_FULL_NAMES = [
  // The agents with short names too: systematic names, and PubChem's titles
  // and IUPAC names (2026-11-07) where they differ
  'isopropyl methylphosphonofluoridate', // sarin
  'propan-2-yl methylphosphonofluoridate', // sarin
  '2-propyl methylphosphonofluoridate', // sarin
  '2-[fluoro(methyl)phosphoryl]oxypropane', // sarin
  'pinacolyl methylphosphonofluoridate', // soman
  '3,3-dimethylbutan-2-yl methylphosphonofluoridate', // soman
  '3-[fluoro(methyl)phosphoryl]oxy-2,2-dimethylbutane', // soman
  'ethyl N,N-dimethylphosphoramidocyanidate', // tabun
  'ethyl dimethylphosphoramidocyanidate', // tabun
  '[dimethylamino(ethoxy)phosphoryl]formonitrile', // tabun
  'cyclohexyl methylphosphonofluoridate', // cyclosarin
  '[fluoro(methyl)phosphoryl]oxycyclohexane', // cyclosarin
  'O-ethyl S-[2-(diisopropylamino)ethyl] methylphosphonothioate', // VX
  'S-[2-(diisopropylamino)ethyl] O-ethyl methylphosphonothioate', // VX
  'S-(2-(bis(1-methylethyl)amino)ethyl) O-ethyl ester', // VX, PubChem title
  'N-[2-[ethoxy(methyl)phosphoryl]sulfanylethyl]-N-propan-2-ylpropan-2-amine', // VX
  'O-isobutyl S-[2-(diethylamino)ethyl] methylphosphonothioate', // VR
  'S-[2-(diethylamino)ethyl] O-isobutyl methylphosphonothioate', // VR
  'O-(2-methylpropyl) S-[2-(diethylamino)ethyl] methylphosphonothioate', // VR
  'S-(2-(diethylamino)ethyl) O-(2-methylpropyl) P-methylphosphonothioate', // VR, PubChem title
  'N,N-diethyl-2-[methyl(2-methylpropoxy)phosphoryl]sulfanylethanamine', // VR
  'bis(2-chloroethyl) sulfide', // HD
  '1-chloro-2-(2-chloroethylthio)ethane', // HD
  '1,2-bis(2-chloroethylthio)ethane', // Q
  'bis(2-chloroethylthioethyl) ether', // T
  '2-chloroethyl chloromethyl sulfide',
  '1-chloro-2-(chloromethylthio)ethane',
  'bis(2-chloroethylthio)methane',
  '1,3-bis(2-chloroethylthio)propane',
  '1,4-bis(2-chloroethylthio)butane',
  '1,5-bis(2-chloroethylthio)pentane',
  'bis(2-chloroethylthiomethyl) ether',
  'S-[2-(diethylamino)ethyl] O-ethyl ethylphosphonothioate', // VE
  'S-[2-(diethylamino)ethyl] O-ethyl methylphosphonothioate', // VM
  'O-ethyl S-[2-(diethylamino)ethyl] ethylphosphonothioate', // VE
  'O-ethyl S-[2-(diethylamino)ethyl] methylphosphonothioate', // VM
  'methylphosphonic difluoride', // DF
  'methylphosphonyl difluoride', // DF
  'O-ethyl O-2-diisopropylaminoethyl methylphosphonite', // QL
  'O-ethyl O-[2-(diisopropylamino)ethyl] methylphosphonite', // QL
  'isopropyl methylphosphonochloridate', // chlorosarin
  '2-propyl methylphosphonochloridate', // chlorosarin
  'propan-2-yl methylphosphonochloridate', // chlorosarin
  'pinacolyl methylphosphonochloridate', // chlorosoman
].map(compactName);

/** Unicode hyphens, dashes and minus signs as an ASCII hyphen. */
function normalizeDashes(text: string): string {
  return text.replace(/[‐-―−﹘﹣－]/g, '-');
}

/**
 * Lowercase, drop single-letter locants (S-, O-, P-, n-, also before a digit
 * as in "S-2-diethylaminoethyl"), spell "sulph" as "sulf", "sulfanyl" as
 * "thio" and "sulfane" as "sulfide", keep letters and digits only.
 */
function compactName(name: string): string {
  return normalizeDashes(name)
    .toLowerCase()
    .replace(/(^|[^a-z0-9])[nops]-(?=[a-z0-9[(])/g, '$1')
    .replace(/sulph/g, 'sulf')
    .replace(/sulfanyl/g, 'thio')
    .replace(/sulfane/g, 'sulfide')
    .replace(/[^a-z0-9]/g, '');
}

function isDeniedName(name: string): boolean {
  if (DENIED_NAMES.test(normalizeDashes(name))) return true;
  const compact = compactName(name);
  return DENIED_FULL_NAMES.some((n) => compact.includes(n));
}

/**
 * Changes whenever either list changes. Part of the tool-result cache key
 * (cache.ts), so an answer cached before an agent was added is never served.
 * FNV-1a, synchronous so it is ready at module load.
 */
export const DENY_LIST_HASH = denyListHash(DENIED_CIDS, DENIED_NAMES, DENIED_FULL_NAMES);

/** Exported for tests; independent of the order of the CIDs. */
export function denyListHash(cids: Iterable<number>, names: RegExp, fullNames: string[]): string {
  return hashString([[...cids].sort((a, b) => a - b).join(','), names.source, fullNames.join('|')].join('\n'));
}

function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const REFUSAL_MESSAGE =
  'MolViewer does not look up chemical warfare agents (Chemical Weapons Convention Schedule 1). ' +
  'It can show other compounds, proteins and nucleic acids.';

export function isDeniedCompound(ref: { cid?: number; names?: (string | undefined)[] }): boolean {
  if (ref.cid !== undefined && DENIED_CIDS.has(ref.cid)) return true;
  return (ref.names ?? []).some((n) => !!n && isDeniedName(n));
}

/** True when a free-text query asks for a denied agent by name. */
export function isDeniedQuery(query: string): boolean {
  return isDeniedName(query);
}
