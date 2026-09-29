/**
 * Convert all-caps RCSB titles ("CRYSTAL STRUCTURE OF DEOXYRIBONUCLEASE I")
 * to sentence case ("Crystal structure of deoxyribonuclease I").
 *
 * Only applied to structure titles. Titles that already use mixed case are
 * returned unchanged, since their casing was chosen by the depositors.
 * Acronyms, roman numerals and tokens containing digits keep their casing.
 */

/** Tokens that stay upper case (compared upper-cased, after stripping punctuation). */
const KEEP_UPPER = new Set([
  'DNA', 'RNA', 'MRNA', 'TRNA', 'RRNA', 'SIRNA', 'MIRNA', 'SSDNA', 'DSDNA', 'CDNA',
  'ATP', 'ADP', 'AMP', 'GTP', 'GDP', 'GMP', 'CTP', 'UTP', 'NAD', 'NADH', 'NADP', 'NADPH',
  'FAD', 'FADH', 'FMN', 'SAM', 'PLP', 'COA', 'ACP', 'UDP',
  'HIV', 'SIV', 'HCV', 'HBV', 'HPV', 'EBV', 'CMV', 'RSV', 'MERS', 'SARS', 'COVID',
  'CRISPR', 'GPCR', 'MHC', 'HLA', 'TCR', 'BCR', 'IGG', 'IGM', 'IGA', 'IGE', 'FAB', 'SCFV', 'VHH',
  'KRAS', 'HRAS', 'NRAS', 'EGFR', 'HER2', 'BRCA', 'PARP', 'CDK', 'MAPK', 'ERK', 'JAK', 'STAT',
  'PDZ', 'SH2', 'SH3', 'PH', 'WD40', 'TIM', 'ABC', 'GFP', 'YFP', 'CFP', 'RFP', 'BFP',
  'NMR', 'EM', 'CRYO', 'XFEL', 'SAXS', 'PDB',
  'ZN', 'FE', 'CU', 'MN', 'NI', 'MG', 'CD', 'HG',
  'USA', 'UK', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'XIII', 'XIV', 'XV',
]);

/** Canonical mixed-case spellings. */
const SPECIAL: Record<string, string> = {
  'SARS-COV-2': 'SARS-CoV-2',
  'SARS-COV': 'SARS-CoV',
  'MERS-COV': 'MERS-CoV',
  'COVID-19': 'COVID-19',
  'IGG1': 'IgG1',
  'IGG': 'IgG',
  'IGM': 'IgM',
  'IGA': 'IgA',
  'IGE': 'IgE',
  'COA': 'CoA',
  'MRNA': 'mRNA',
  'TRNA': 'tRNA',
  'RRNA': 'rRNA',
  'SIRNA': 'siRNA',
  'MIRNA': 'miRNA',
  'SSDNA': 'ssDNA',
  'DSDNA': 'dsDNA',
  'CDNA': 'cDNA',
  'SCFV': 'scFv',
  'CRYO-EM': 'cryo-EM',
  'DNASE': 'DNase',
  'RNASE': 'RNase',
  'ANGSTROM': 'Å',
  'ANGSTROMS': 'Å',
};

/** Single capital letters that follow these words are identifiers (chain A, form I). */
const LETTER_CONTEXT = new Set([
  'CHAIN', 'CHAINS', 'DOMAIN', 'SUBUNIT', 'SUBUNITS', 'FORM', 'TYPE', 'SITE', 'VITAMIN',
  'PROTEIN', 'COMPLEX', 'ISOFORM', 'FRAGMENT', 'REGION', 'LOOP', 'HELIX', 'STRAND', 'MUTANT',
  'CLASS', 'GROUP', 'FACTOR', 'PHOTOSYSTEM', 'CYTOCHROME', 'PROTEASE', 'KINASE', 'NUCLEASE',
  'DEOXYRIBONUCLEASE', 'RIBONUCLEASE', 'LYSOZYME', 'SYNTHASE', 'POLYMERASE', 'RECEPTOR',
]);

const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV)$/;

/** True when the title is (almost) entirely upper case letters. */
function isMostlyUpper(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.85;
}

function caseWordPart(part: string, prevWord: string | null, isFirst: boolean): string {
  if (!part) return part;
  const bare = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  const upperBare = bare.toUpperCase();
  const lead = part.slice(0, part.indexOf(bare));
  const trail = part.slice(part.indexOf(bare) + bare.length);

  if (!bare) return part;
  if (SPECIAL[upperBare]) return lead + SPECIAL[upperBare] + trail;
  // Tokens with digits are identifiers (HIV-1, 2.0, E.C.3.1.21.1, P450).
  if (/\d/.test(bare)) return part;
  if (KEEP_UPPER.has(upperBare)) return part;
  // Roman numerals (deoxyribonuclease I, photosystem II), and single letters after identifier words (chain A).
  if (bare.length === 1 || ROMAN.test(upperBare)) {
    const prev = (prevWord ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
    if (ROMAN.test(upperBare) && upperBare !== 'I' && upperBare !== 'V' && upperBare !== 'X') return part;
    if (prev && LETTER_CONTEXT.has(prev)) return part;
    if (bare.length === 1 && !isFirst && upperBare !== 'A') return part;
  }
  const lower = part.toLowerCase();
  return isFirst ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
}

export function toSentenceCase(title: string): string {
  const trimmed = title.replace(/\s+/g, ' ').trim();
  if (!isMostlyUpper(trimmed)) return trimmed;

  const words = trimmed.split(' ');
  let prev: string | null = null;
  const out = words.map((word, i) => {
    // A new sentence starts after a full stop ("... AT ATOMIC RESOLUTION. PENTAGON RINGS").
    const startsSentence = i === 0 || (prev !== null && /\.$/.test(prev));
    // Compound spellings such as SARS-COV-2 are matched as a whole first.
    const bareWhole = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toUpperCase();
    let result: string;
    if (SPECIAL[bareWhole]) {
      result = word.replace(new RegExp(bareWhole.replace(/[-.]/g, '\\$&'), 'i'), SPECIAL[bareWhole]);
    } else if (/^\([A-Z0-9]{2,6}\)[.,;:]?$/.test(word)) {
      // Short parenthesised tokens are gene names or acronyms: "(KCSA)", "(PKA)".
      result = word;
    } else {
      // Treat hyphenated words part by part (ZN-BOUND -> ZN-bound).
      result = word
        .split('-')
        .map((part, j) => caseWordPart(part, j === 0 ? prev : null, startsSentence && j === 0))
        .join('-');
    }
    prev = word;
    return result;
  });
  return out.join(' ');
}
