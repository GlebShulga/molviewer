import type { Atom, Molecule } from "../types";
import { PARSER_CONFIG } from "../config";
import { inferBondsFromDistance } from "../utils/bondInference";

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
  // Not filtered: the comment line (line 2) may be blank, and dropping it
  // would turn the first atom into the comment.
  const lines = xyzString.split(/\r?\n/);

  let countLine = 0;
  while (countLine < lines.length && !lines[countLine].trim()) countLine++;

  if (lines.length - countLine < 2) {
    throw new Error("Invalid XYZ format: file too short");
  }

  const atomCount = parseInt(lines[countLine].trim(), 10);
  if (isNaN(atomCount)) {
    throw new Error("Invalid XYZ format: cannot parse atom count");
  }

  const comment = lines[countLine + 1].trim();
  const moleculeName = comment || "Molecule";

  const atoms: Atom[] = [];

  // The next atomCount non-blank lines; anything after them (further frames
  // of a trajectory) is ignored. Messages give 1-based line numbers in the file.
  for (let i = countLine + 2; i < lines.length && atoms.length < atomCount; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);

    if (parts.length < 4) {
      throw new Error(`Invalid XYZ format: malformed atom line at line ${i + 1}`);
    }

    const element = parts[0];
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      throw new Error(`Invalid XYZ format: cannot parse coordinates at line ${i + 1}`);
    }

    atoms.push({
      id: atoms.length,
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
