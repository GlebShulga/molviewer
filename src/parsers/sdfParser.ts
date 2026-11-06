import type { Atom, Bond, Molecule } from "../types";

export interface SDFParserOptions {
  parseProperties?: boolean;
}

const DEFAULT_OPTIONS: SDFParserOptions = {
  parseProperties: false,
};

/** Atom-block charge codes (columns 37-39). 4 is a doublet radical, not a charge. */
const ATOM_BLOCK_CHARGES: Record<number, number> = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };

/**
 * Applies the property block's "M  CHG" lines. By the V2000 format, any CHG,
 * RAD or ISO line replaces every charge and radical in the atom block, so
 * those are cleared first.
 */
function applyPropertyCharges(lines: string[], start: number, atoms: Atom[]): void {
  const properties: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('M  END') || line.startsWith('$$$$')) break;
    if (line.startsWith('M  ')) properties.push(line);
  }
  if (!properties.some(line => /^M {2}(CHG|RAD|ISO)/.test(line))) return;

  for (const atom of atoms) delete atom.formalCharge;
  for (const line of properties) {
    if (!line.startsWith('M  CHG')) continue;
    // "M  CHGnn8 aaa vvv ...": an entry count, then atom number / charge pairs
    const fields = line.substring(6).trim().split(/\s+/).map(Number);
    for (let k = 1; k + 1 < fields.length && k < 1 + 2 * fields[0]; k += 2) {
      const atom = atoms[fields[k] - 1];
      const charge = fields[k + 1];
      if (atom && Number.isInteger(charge) && charge !== 0) atom.formalCharge = charge;
    }
  }
}

export function parseSDF(
  sdfString: string,
  options: SDFParserOptions = {}
): Molecule {
  void { ...DEFAULT_OPTIONS, ...options };
  const lines = sdfString.split(/\r?\n/);

  if (lines.length < 4) {
    throw new Error("Invalid SDF format: file too short");
  }

  const moleculeName = lines[0].trim() || "Molecule";

  const countsLine = lines[3];
  const atomCount = parseInt(countsLine.substring(0, 3).trim(), 10);
  const bondCount = parseInt(countsLine.substring(3, 6).trim(), 10);

  if (isNaN(atomCount) || isNaN(bondCount)) {
    throw new Error("Invalid SDF format: cannot parse atom/bond counts");
  }

  const atoms: Atom[] = [];
  const atomBlockStart = 4;
  const atomBlockEnd = atomBlockStart + atomCount;

  for (let i = atomBlockStart; i < atomBlockEnd; i++) {
    const line = lines[i];
    if (!line) {
      throw new Error(`Invalid SDF format: missing atom at line ${i + 1}`);
    }

    const x = parseFloat(line.substring(0, 10).trim());
    const y = parseFloat(line.substring(10, 20).trim());
    const z = parseFloat(line.substring(20, 30).trim());
    const element = line.substring(31, 34).trim();

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      throw new Error(`Invalid SDF format: cannot parse coordinates at line ${i + 1}`);
    }

    const formalCharge = ATOM_BLOCK_CHARGES[parseInt(line.substring(36, 39).trim(), 10)];

    atoms.push({
      id: i - atomBlockStart,
      element,
      x,
      y,
      z,
      ...(formalCharge !== undefined && { formalCharge }),
    });
  }

  const bonds: Bond[] = [];
  const bondBlockStart = atomBlockEnd;
  const bondBlockEnd = bondBlockStart + bondCount;

  for (let i = bondBlockStart; i < bondBlockEnd; i++) {
    const line = lines[i];
    if (!line) {
      throw new Error(`Invalid SDF format: missing bond at line ${i + 1}`);
    }

    const atom1 = parseInt(line.substring(0, 3).trim(), 10) - 1;
    const atom2 = parseInt(line.substring(3, 6).trim(), 10) - 1;
    const bondType = parseInt(line.substring(6, 9).trim(), 10);

    if (isNaN(atom1) || isNaN(atom2) || isNaN(bondType)) {
      throw new Error(`Invalid SDF format: cannot parse bond at line ${i + 1}`);
    }

    // Validate bond indices are within bounds
    if (atom1 < 0 || atom1 >= atoms.length || atom2 < 0 || atom2 >= atoms.length) {
      console.warn(`Invalid bond indices at line ${i + 1}: ${atom1 + 1}-${atom2 + 1}`);
      continue;
    }

    let order: 1 | 2 | 3 = 1;
    if (bondType === 2) order = 2;
    else if (bondType === 3) order = 3;

    bonds.push({
      atom1Index: atom1,
      atom2Index: atom2,
      order,
      // Type 4 is aromatic: drawn as a single bond, flagged for ring detection
      ...(bondType === 4 && { isAromatic: true }),
    });
  }

  applyPropertyCharges(lines, bondBlockEnd, atoms);

  return {
    name: moleculeName,
    atoms,
    bonds,
  };
}
