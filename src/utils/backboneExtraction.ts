import type { Atom, Molecule, SecondaryStructure } from '../types';
import {
  atomResidueId,
  chainKey,
  compareResidueIds,
  isAminoAcid,
  NUCLEIC_ACID_RESIDUES,
  residueLabel,
} from './residueAnalysis';

export interface BackboneResidue {
  residueNumber: number;
  /** Insertion code: 52A follows 52 */
  insertionCode?: string;
  chainId: string;
  residueName: string;
  ca: { x: number; y: number; z: number };
  c?: { x: number; y: number; z: number };
  n?: { x: number; y: number; z: number };
  o?: { x: number; y: number; z: number };
  p?: { x: number; y: number; z: number }; // Phosphate atom for nucleic acids
  secondaryStructure: SecondaryStructure;
  atomIndex: number; // Index of CA/P atom for color reference
}

export interface BackboneChain {
  chainId: string;
  residues: BackboneResidue[];
}

/**
 * An amino acid's alpha carbon: named CA with element C. Not a calcium ion,
 * which PDB files also name CA; files without an element column give a
 * protein's CA the element C (the parsers read it from the name).
 */
export function isAlphaCarbon(atom: Pick<Atom, 'name' | 'element'>): boolean {
  return atom.name?.trim().toUpperCase() === 'CA' && atom.element?.toUpperCase() === 'C';
}

/** What an atom list's backbone answers are, each filled on first use. */
interface BackboneFacts {
  traceable?: ReadonlySet<string>;
  hasBackbone?: boolean;
  chainlessAmbiguous?: boolean;
}

/**
 * Backbone facts per atom list. They read residue fields (chain, number,
 * insertion code, residue name), atom names and elements, which never change
 * after parsing; only secondaryStructure is written on atoms. Each walks
 * every atom, and the color context, each atom-style component, Cartoon,
 * the toolbar and the panels ask for them.
 */
const backboneCache = new WeakMap<Atom[], BackboneFacts>();

function backboneFacts(atoms: Atom[]): BackboneFacts {
  let facts = backboneCache.get(atoms);
  if (!facts) {
    facts = {};
    backboneCache.set(atoms, facts);
  }
  return facts;
}

/**
 * The residues Cartoon traces, as atomResidueId keys (chain, name, number
 * and insertion code, so a ligand that shares a residue's number is a
 * residue of its own): amino acids and nucleotides by name, and any other
 * residue with atoms named N and C, as modified amino acids (MSE) and
 * simulation names (HIE, CYX) have. No CA is required: a cap such as NME
 * (N and C only) stays in, and its N gives the last residue its psi angle
 * (detectSecondaryStructure); Cartoon traces only residues with a CA.
 * Not water or ions, and not ligands without both names: their atoms can
 * carry backbone names (a ligand carbon named CA) and, in MD and docking
 * output, a residue's number. A ligand with amino-acid atom names (SAM) is
 * in; the classifier keeps it a ligand (no peptide link), so the protein's
 * Cartoon filter leaves it out.
 *
 * Walked once per atom list (backboneCache), so detectSecondaryStructure
 * and extractBackbone on Cartoon's copy share one pass. The set is shared
 * between callers: read-only.
 */
export function traceableResidues(molecule: Molecule): ReadonlySet<string> {
  const facts = backboneFacts(molecule.atoms);
  return (facts.traceable ??= findTraceableResidues(molecule.atoms));
}

function findTraceableResidues(atoms: Atom[]): Set<string> {
  const result = new Set<string>();
  // Per other residue: 1 when it has an N, 2 when it has a C
  const named = new Map<string, number>();
  // A residue's atoms are almost always consecutive: its key and name check once per residue
  let previous: Atom | undefined;
  let key = '';
  let byName = false;
  for (const atom of atoms) {
    if (atom.residueNumber === undefined) continue;
    if (
      !previous || atom.residueNumber !== previous.residueNumber || atom.residueName !== previous.residueName ||
      atom.chainId !== previous.chainId || atom.insertionCode !== previous.insertionCode
    ) {
      key = atomResidueId(atom);
      const residueName = atom.residueName?.toUpperCase() ?? '';
      byName = isAminoAcid(residueName) || NUCLEIC_ACID_RESIDUES.has(residueName);
      if (byName) result.add(key);
    }
    previous = atom;
    if (byName) continue;
    const atomName = atom.name?.trim().toUpperCase();
    const bit = atomName === 'N' ? 1 : atomName === 'C' ? 2 : 0;
    if (!bit) continue;
    const flags = (named.get(key) ?? 0) | bit;
    named.set(key, flags);
    if (flags === 3) result.add(key);
  }
  return result;
}

/**
 * The filter both backbone passes (extractBackbone for Cartoon,
 * detectSecondaryStructure's phi/psi) apply after their own atom-name check,
 * which comes first because it is cheap and this one builds a residue key.
 * An atom passes when it has a residue number (residue 0 included), isn't
 * without a chain ID in a file whose chainless segments restart their
 * numbering (chainlessTraceIsAmbiguous: they would merge into one zigzag),
 * and belongs to a residue Cartoon traces (traceableResidues: a ligand's or
 * water's N, CA, C or O with a residue's number must not replace that
 * residue's atoms).
 */
export function tracedAtomFilter(molecule: Molecule): (atom: Atom) => atom is Atom & { residueNumber: number } {
  const traceable = traceableResidues(molecule);
  const skipChainless = chainlessTraceIsAmbiguous(molecule);
  return (atom): atom is Atom & { residueNumber: number } =>
    atom.residueNumber !== undefined && !(skipChainless && !atom.chainId) && traceable.has(atomResidueId(atom));
}

const BACKBONE_NAMES = new Set(['CA', 'C', 'N', 'O', 'P']);

/**
 * Extract backbone residues from a molecule.
 * Groups atoms by chain and residue, extracts CA (alpha carbon) positions for proteins
 * and P (phosphate) positions for nucleic acids.
 * Optionally extracts C, N, O for orientation calculations in proteins.
 */
export function extractBackbone(molecule: Molecule): BackboneChain[] {
  // Residues keyed by number and insertion code ("52", "52A")
  const chainMap = new Map<string, Map<string, BackboneResidue>>();
  const traced = tracedAtomFilter(molecule);

  for (let atomIndex = 0; atomIndex < molecule.atoms.length; atomIndex++) {
    const atom = molecule.atoms[atomIndex];
    // Only backbone atoms (CA, C, N, O for proteins; P for nucleic acids), the
    // cheap check first; then the residues Cartoon traces. A blank chain is
    // the chain 'Unknown' (chainKey) unless it can't be traced.
    const atomName = atom.name?.trim().toUpperCase();
    if (!atomName || !BACKBONE_NAMES.has(atomName)) continue;
    if (!traced(atom) || !atom.residueName) continue;

    const chainId = chainKey(atom);
    const resNum = atom.residueNumber;
    const resKey = residueLabel(resNum, atom.insertionCode);
    const isNucleicAcid = NUCLEIC_ACID_RESIDUES.has(atom.residueName.toUpperCase());

    // A calcium ion is often named CA too (isBackboneAtom)
    if (atomName === 'CA' && atom.element?.toUpperCase() !== 'C') {
      continue;
    }

    // Skip P atoms for non-nucleic acids
    if (atomName === 'P' && !isNucleicAcid) {
      continue;
    }

    // Get or create chain map
    if (!chainMap.has(chainId)) {
      chainMap.set(chainId, new Map());
    }
    const residueMap = chainMap.get(chainId)!;

    // Get or create residue entry
    if (!residueMap.has(resKey)) {
      residueMap.set(resKey, {
        residueNumber: resNum,
        ...(atom.insertionCode ? { insertionCode: atom.insertionCode } : {}),
        chainId,
        residueName: atom.residueName,
        ca: { x: 0, y: 0, z: 0 },
        secondaryStructure: atom.secondaryStructure || 'coil',
        atomIndex: -1,
      });
    }

    const residue = residueMap.get(resKey)!;
    const pos = { x: atom.x, y: atom.y, z: atom.z };

    switch (atomName) {
      case 'CA':
        residue.ca = pos;
        residue.atomIndex = atomIndex;
        // Update SS from CA atom (most reliable source)
        if (atom.secondaryStructure) {
          residue.secondaryStructure = atom.secondaryStructure;
        }
        break;
      case 'P':
        // Phosphate atom for nucleic acids
        residue.p = pos;
        if (residue.atomIndex < 0) {
          residue.atomIndex = atomIndex;
        }
        break;
      case 'C':
        residue.c = pos;
        break;
      case 'N':
        residue.n = pos;
        break;
      case 'O':
        residue.o = pos;
        break;
    }
  }

  // Convert to sorted arrays
  const chains: BackboneChain[] = [];

  for (const [chainId, residueMap] of chainMap) {
    const residues = Array.from(residueMap.values())
      // Filter out residues without backbone atom (CA for proteins, P for nucleic acids)
      .filter(r => r.atomIndex >= 0 || r.p !== undefined)
      // Sort by residue number, then insertion code
      .sort((a, b) => compareResidueIds(a.residueNumber, a.insertionCode, b.residueNumber, b.insertionCode));

    if (residues.length > 0) {
      chains.push({ chainId, residues });
    }
  }

  // Sort chains alphabetically
  chains.sort((a, b) => a.chainId.localeCompare(b.chainId));

  return chains;
}

/**
 * An atom Cartoon can trace: the alpha carbon of a residue it traces
 * (traceableResidues), or a nucleotide's phosphorus (as extractBackbone
 * takes P only in nucleic acids). Not a lipid's P (POPC has one), not a
 * ligand carbon named CA, and not a calcium ion, which PDB files also name
 * CA; files without an element column give a protein's CA the element C
 * (the parsers read it from the name).
 */
export function isBackboneAtom(atom: Atom, traceable: ReadonlySet<string>): boolean {
  if (atom.residueNumber === undefined) return false;
  const name = atom.name?.trim().toUpperCase();
  if (name === 'CA') return atom.element?.toUpperCase() === 'C' && traceable.has(atomResidueId(atom));
  if (name === 'P') return NUCLEIC_ACID_RESIDUES.has(atom.residueName?.toUpperCase() ?? '');
  return false;
}

/**
 * Whether the atoms without a chain ID (chain 'Unknown') hold more than one
 * chain: two backbone atoms (isBackboneAtom) with the same residue number
 * and insertion code. Files from simulation packages write segments without
 * chain IDs and restart the numbering in each; keyed by number, the
 * segments would merge into one zigzag trace, so the chain isn't traced.
 * Once per atom list (backboneCache).
 */
export function chainlessTraceIsAmbiguous(molecule: Molecule): boolean {
  const facts = backboneFacts(molecule.atoms);
  return (facts.chainlessAmbiguous ??= findChainlessAmbiguity(molecule));
}

function findChainlessAmbiguity(molecule: Molecule): boolean {
  const traceable = traceableResidues(molecule);
  const seen = new Set<string>();
  for (const atom of molecule.atoms) {
    if (atom.chainId || !isBackboneAtom(atom, traceable)) continue;
    const key = residueLabel(atom.residueNumber, atom.insertionCode);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Check if a molecule has backbone data suitable for cartoon representation:
 * any atom Cartoon can trace (isBackboneAtom), in a chain extractBackbone
 * traces. Once per atom list (backboneCache), the fast path's answer
 * included: on a chainless file that loop walks every atom and finds nothing.
 */
export function hasBackboneData(molecule: Molecule): boolean {
  const facts = backboneFacts(molecule.atoms);
  return (facts.hasBackbone ??= findBackbone(molecule));
}

function findBackbone(molecule: Molecule): boolean {
  // The common case without building traceableResidues: a standard amino
  // acid's alpha carbon in a chain with an ID
  for (const atom of molecule.atoms) {
    if (
      atom.chainId && atom.residueNumber !== undefined && atom.name?.trim().toUpperCase() === 'CA' &&
      atom.element?.toUpperCase() === 'C' && isAminoAcid(atom.residueName ?? '')
    ) {
      return true;
    }
  }
  const traceable = traceableResidues(molecule);
  let chainless = false;
  for (const atom of molecule.atoms) {
    if (!isBackboneAtom(atom, traceable)) continue;
    if (atom.chainId) return true;
    chainless = true;
  }
  return chainless && !chainlessTraceIsAmbiguous(molecule);
}
