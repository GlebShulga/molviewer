import type { Atom, Bond, Molecule } from "../types";

export interface SDFParserOptions {
  parseProperties?: boolean;
}

const DEFAULT_OPTIONS: SDFParserOptions = {
  parseProperties: false,
};

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

    atoms.push({
      id: i - atomBlockStart,
      element,
      x,
      y,
      z,
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
    });
  }

  return {
    name: moleculeName,
    atoms,
    bonds,
  };
}
