import type { Atom, Molecule } from "../types";
import { PARSER_CONFIG } from "../config";
import { inferBondsFromDistance } from "../utils";

export interface XYZParserOptions {
  inferBonds?: boolean;
  bondTolerance?: number;
}

const DEFAULT_OPTIONS: XYZParserOptions = {
  inferBonds: true,
  bondTolerance: PARSER_CONFIG.bondTolerance,
};

export function parseXYZ(
  xyzString: string,
  options: XYZParserOptions = {}
): Molecule {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = xyzString.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error("Invalid XYZ format: file too short");
  }

  const atomCount = parseInt(lines[0].trim(), 10);
  if (isNaN(atomCount)) {
    throw new Error("Invalid XYZ format: cannot parse atom count");
  }

  const comment = lines[1].trim();
  const moleculeName = comment || "Molecule";

  const atoms: Atom[] = [];

  for (let i = 2; i < Math.min(2 + atomCount, lines.length); i++) {
    const line = lines[i].trim();
    const parts = line.split(/\s+/);

    if (parts.length < 4) {
      throw new Error(`Invalid XYZ format: malformed atom line at ${i + 1}`);
    }

    const element = parts[0];
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      throw new Error(`Invalid XYZ format: cannot parse coordinates at line ${i + 1}`);
    }

    atoms.push({
      id: i - 2,
      element,
      x,
      y,
      z,
    });
  }

  const bonds = opts.inferBonds
    ? inferBondsFromDistance(atoms, opts.bondTolerance!)
    : [];

  return {
    name: moleculeName,
    atoms,
    bonds,
  };
}
