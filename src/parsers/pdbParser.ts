import type { Atom, Bond, Molecule, SecondaryStructure, BiologicalAssembly } from "../types";
import { PARSER_CONFIG } from "../config";
import { inferBondsFromDistance } from "../utils/bondInference";
import { DEFAULT_ELEMENT, getElement } from "../constants";
import { createAltLocFilter } from "./altLoc";
import { compareResidueIds } from "../utils/residueAnalysis";

export interface PDBParserOptions {
  inferBonds?: boolean;
  bondTolerance?: number;
  /** Parse BIOMT records for biological assemblies (default: true) */
  parseAssemblies?: boolean;
}

interface SecondaryStructureRange {
  type: SecondaryStructure;
  chainId: string;
  startResNum: number;
  startInsertionCode?: string;
  endResNum: number;
  endInsertionCode?: string;
}

const DEFAULT_OPTIONS: PDBParserOptions = {
  inferBonds: true,
  bondTolerance: PARSER_CONFIG.bondTolerance,
  parseAssemblies: true,
};

/**
 * Temporary structure for collecting BIOMT data during parsing.
 */
interface BIOMTCollector {
  assemblyId: string;
  operatorId: number;
  chainIds: string[];
  matrixRows: number[][]; // 3 rows of 4 values each
}

/**
 * Parse REMARK 350 BIOMT records for biological assembly information.
 *
 * Format:
 * REMARK 350 BIOMOLECULE: 1
 * REMARK 350 APPLY THE FOLLOWING TO CHAINS: A, B, C
 * REMARK 350   BIOMT1   1  1.000000  0.000000  0.000000        0.00000
 * REMARK 350   BIOMT2   1  0.000000  1.000000  0.000000        0.00000
 * REMARK 350   BIOMT3   1  0.000000  0.000000  1.000000        0.00000
 */
function parseBIOMTRecords(lines: string[]): BiologicalAssembly[] {
  const assemblies: Map<string, BiologicalAssembly> = new Map();
  let currentAssemblyId = "1";
  let currentChainIds: string[] = [];
  const biomtData: Map<string, BIOMTCollector[]> = new Map();

  for (const line of lines) {
    if (!line.startsWith("REMARK 350")) continue;

    const content = line.substring(10).trim();

    // Parse BIOMOLECULE declaration
    if (content.startsWith("BIOMOLECULE:")) {
      currentAssemblyId = content.substring(12).trim();
      if (!assemblies.has(currentAssemblyId)) {
        assemblies.set(currentAssemblyId, {
          id: currentAssemblyId,
          transforms: [],
          copyCount: 0,
        });
      }
      if (!biomtData.has(currentAssemblyId)) {
        biomtData.set(currentAssemblyId, []);
      }
      continue;
    }

    // Parse APPLY THE FOLLOWING TO CHAINS
    if (content.includes("APPLY THE FOLLOWING TO CHAINS:")) {
      const chainsStr = content.split("CHAINS:")[1]?.trim() || "";
      currentChainIds = chainsStr.split(",").map((c) => c.trim()).filter(Boolean);
      continue;
    }

    // Parse BIOMT matrix rows
    const biomtMatch = content.match(/BIOMT([123])\s+(\d+)\s+([\d.\-+eE\s]+)/);
    if (biomtMatch) {
      const rowNum = parseInt(biomtMatch[1], 10);
      const operatorId = parseInt(biomtMatch[2], 10);
      const values = biomtMatch[3].trim().split(/\s+/).map(parseFloat);

      if (values.length >= 4 && !values.some(isNaN)) {
        let collectors = biomtData.get(currentAssemblyId);
        if (!collectors) {
          collectors = [];
          biomtData.set(currentAssemblyId, collectors);
        }

        // Find or create collector for this operator
        let collector = collectors.find((c) => c.operatorId === operatorId);
        if (!collector) {
          collector = {
            assemblyId: currentAssemblyId,
            operatorId,
            chainIds: [...currentChainIds],
            matrixRows: [],
          };
          collectors.push(collector);
        }

        // Add row (BIOMT1=row0, BIOMT2=row1, BIOMT3=row2)
        collector.matrixRows[rowNum - 1] = values.slice(0, 4);
      }
    }
  }

  // Convert collectors to transforms
  for (const [assemblyId, collectors] of biomtData) {
    const assembly = assemblies.get(assemblyId);
    if (!assembly) continue;

    for (const collector of collectors) {
      if (collector.matrixRows.length === 3) {
        // Build 4x4 matrix (row-major)
        // BIOMT provides 3x4 (rotation + translation), we add [0,0,0,1] bottom row
        const matrix: number[] = [
          ...collector.matrixRows[0],
          ...collector.matrixRows[1],
          ...collector.matrixRows[2],
          0, 0, 0, 1,
        ];

        assembly.transforms.push({
          assemblyId: collector.assemblyId,
          operatorId: collector.operatorId,
          chainIds: collector.chainIds,
          matrix,
        });
      }
    }

    assembly.copyCount = assembly.transforms.length;
  }

  return Array.from(assemblies.values()).filter((a) => a.transforms.length > 0);
}

/**
 * Parse HELIX record from PDB file
 * HELIX format (1-indexed columns):
 * - Column 20: Start chain ID (initChainID)
 * - Columns 22-25: Start residue number (initSeqNum)
 * - Column 32: End chain ID (endChainID)
 * - Columns 34-37: End residue number (endSeqNum)
 */
function parseHelixRecord(line: string): SecondaryStructureRange | null {
  if (line.length < 37) return null;

  const startChainId = line.substring(19, 20).trim();
  const startResNum = parseInt(line.substring(21, 25).trim(), 10);
  const startInsertionCode = line.charAt(25).trim() || undefined;
  const endChainId = line.substring(31, 32).trim();
  const endResNum = parseInt(line.substring(33, 37).trim(), 10);
  const endInsertionCode = line.charAt(37).trim() || undefined;

  if (isNaN(startResNum) || isNaN(endResNum)) return null;

  // Use start chain if end chain is empty (they should match for valid HELIX)
  const chainId = startChainId || endChainId;

  return {
    type: 'helix',
    chainId,
    startResNum,
    startInsertionCode,
    endResNum,
    endInsertionCode,
  };
}

/**
 * Parse SHEET record from PDB file
 * SHEET format (1-indexed columns):
 * - Column 22: Start chain ID (initChainID)
 * - Columns 23-26: Start residue number (initSeqNum)
 * - Column 33: End chain ID (endChainID)
 * - Columns 34-37: End residue number (endSeqNum)
 */
function parseSheetRecord(line: string): SecondaryStructureRange | null {
  if (line.length < 37) return null;

  const startChainId = line.substring(21, 22).trim();
  const startResNum = parseInt(line.substring(22, 26).trim(), 10);
  const startInsertionCode = line.charAt(26).trim() || undefined;
  const endChainId = line.substring(32, 33).trim();
  const endResNum = parseInt(line.substring(33, 37).trim(), 10);
  const endInsertionCode = line.charAt(37).trim() || undefined;

  if (isNaN(startResNum) || isNaN(endResNum)) return null;

  // Use start chain if end chain is empty
  const chainId = startChainId || endChainId;

  return {
    type: 'sheet',
    chainId,
    startResNum,
    startInsertionCode,
    endResNum,
    endInsertionCode,
  };
}

/**
 * Assign secondary structure to an atom based on parsed ranges
 */
function getSecondaryStructure(
  chainId: string | undefined,
  residueNumber: number | undefined,
  insertionCode: string | undefined,
  ranges: SecondaryStructureRange[]
): SecondaryStructure | undefined {
  if (residueNumber === undefined || ranges.length === 0) {
    return undefined;
  }

  for (const range of ranges) {
    if (
      // A blank chain ID is '' in HELIX/SHEET records and undefined on atoms
      (range.chainId || '') === (chainId || '') &&
      // Number, then insertion code: a range ending at 52B covers 52A
      compareResidueIds(residueNumber, insertionCode, range.startResNum, range.startInsertionCode) >= 0 &&
      compareResidueIds(residueNumber, insertionCode, range.endResNum, range.endInsertionCode) <= 0
    ) {
      return range.type;
    }
  }

  // If we have SS data but this residue isn't in helix/sheet, it's a coil
  return 'coil';
}

/** "ZN" → "Zn", "se" → "Se": the form the element table and the classifier use. */
function normalizeElement(symbol: string): string {
  return symbol.charAt(0).toUpperCase() + symbol.slice(1).toLowerCase();
}

/** Residues whose atoms are all one-letter elements (C, N, O, S, P, H). */
const STANDARD_RESIDUES = new Set([
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
  'A', 'C', 'G', 'U', 'I', 'DA', 'DC', 'DG', 'DT', 'DU', 'DI',
]);

/**
 * Two-letter symbols that are also common atom names (alpha carbon, delta
 * carbon, epsilon nitrogen, ...). Read as the element only in a residue
 * named after it: "CA" in residue CA is calcium.
 */
const AMBIGUOUS_TWO_LETTER = new Set(['CA', 'CD', 'NE', 'HE', 'NA', 'HG']);

/**
 * Element from columns 77-78, or from the atom name (columns 13-16) when
 * that column is blank, following the PDB convention that a two-letter
 * element starts in column 13 and a one-letter one in column 14.
 *
 * Known limits: an organomercury Hg in a ligand not named HG reads as H, and
 * CHARMM ion residue names (SOD, POT, CAL) aren't recognized as ions.
 */
function parseElement(line: string, residueName: string): string {
  const elementCol = line.substring(76, 78).trim();
  if (elementCol) {
    return normalizeElement(elementCol);
  }

  const raw = line.substring(12, 16).padEnd(4);
  const name = raw.trim();
  const c13 = raw.charAt(0);
  const c14 = raw.charAt(1);
  const oneLetter = c13 === ' ' || /\d/.test(c13) ? c14 : c13;

  // Hydrogens: HG21, HE21, HD11 (four characters starting with H) or 1HG2
  if ((name.length === 4 && c13 === 'H') || /\d/.test(c13)) return 'H';

  const residue = residueName.trim().toUpperCase();
  if (STANDARD_RESIDUES.has(residue)) return normalizeElement(oneLetter);

  if (/[A-Za-z]/.test(c13) && /[A-Za-z]/.test(c14)) {
    const two = (c13 + c14).toUpperCase();
    const known = getElement(two) !== DEFAULT_ELEMENT;
    if (known && (!AMBIGUOUS_TWO_LETTER.has(two) || residue === two)) return normalizeElement(two);
  }
  return normalizeElement(oneLetter);
}

function parseAtomLine(line: string, index: number): Atom | null {
  const recordType = line.substring(0, 6).trim();
  if (recordType !== "ATOM" && recordType !== "HETATM") {
    return null;
  }

  const serial = parseInt(line.substring(6, 11).trim(), 10);
  const name = line.substring(12, 16).trim();
  const residueName = line.substring(17, 20).trim();
  const chainId = line.substring(21, 22).trim();
  const resSeq = parseInt(line.substring(22, 26).trim(), 10);
  const residueNumber = Number.isNaN(resSeq) ? undefined : resSeq;
  const insertionCode = line.charAt(26).trim();
  const x = parseFloat(line.substring(30, 38).trim());
  const y = parseFloat(line.substring(38, 46).trim());
  const z = parseFloat(line.substring(46, 54).trim());
  // 0 is a real occupancy; only a blank column means "fully occupied"
  const occupancyValue = parseFloat(line.substring(54, 60).trim());
  const occupancy = Number.isFinite(occupancyValue) ? occupancyValue : 1;
  const tempFactorStr = line.substring(60, 66).trim();
  const tempFactor = tempFactorStr ? parseFloat(tempFactorStr) : undefined;
  const element = parseElement(line, residueName);
  const altLoc = line.charAt(16).trim();

  if (isNaN(x) || isNaN(y) || isNaN(z)) {
    return null;
  }

  return {
    id: index,
    serial,
    name,
    element,
    x,
    y,
    z,
    residueName,
    residueNumber,
    ...(insertionCode ? { insertionCode } : {}),
    chainId: chainId || undefined,
    occupancy,
    ...(altLoc ? { altLoc } : {}),
    tempFactor,
  };
}

function parseConnectLine(line: string): number[] {
  const serials: number[] = [];
  const primarySerial = parseInt(line.substring(6, 11).trim(), 10);
  if (!isNaN(primarySerial)) {
    serials.push(primarySerial);
  }

  for (let i = 11; i <= 26; i += 5) {
    const bondedSerial = parseInt(line.substring(i, i + 5).trim(), 10);
    if (!isNaN(bondedSerial)) {
      serials.push(bondedSerial);
    }
  }

  return serials;
}

export function parsePDB(
  pdbString: string,
  options: PDBParserOptions = {}
): Molecule {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = pdbString.split(/\r?\n/);

  const atoms: Atom[] = [];
  const serialToIndex = new Map<number, number>();
  const connectRecords: number[][] = [];
  const ssRanges: SecondaryStructureRange[] = [];
  let moleculeName = "Molecule";
  // COMPND is either a "MOL_ID: 1; MOLECULE: ...; CHAIN: A; ..." specification
  // or, from docking and modelling tools, a single free-text line.
  let compndMolecule: string | undefined;
  let compndText: string | undefined;

  // First pass: parse HELIX/SHEET records and metadata
  for (const line of lines) {
    const recordType = line.substring(0, 6).trim();

    if (recordType === "HEADER") {
      moleculeName = line.substring(62, 66).trim() || line.substring(10, 50).trim() || moleculeName;
    } else if (recordType === "COMPND") {
      const text = line.substring(10).trim();
      const molecule = text.match(/^MOLECULE:\s*(.*?);?$/i);
      if (molecule) compndMolecule ??= molecule[1].trim();
      else if (text && !/^[A-Z_]+:/i.test(text)) compndText ??= text;
    } else if (recordType === "HELIX") {
      const range = parseHelixRecord(line);
      if (range) ssRanges.push(range);
    } else if (recordType === "SHEET") {
      const range = parseSheetRecord(line);
      if (range) ssRanges.push(range);
    }
  }
  // A PDB ID from HEADER wins over the compound name.
  if (!/^[A-Z0-9]{4}$/.test(moleculeName)) {
    moleculeName = compndMolecule || compndText || moleculeName;
  }

  // Second pass: parse ATOM/HETATM and CONECT records
  // For NMR structures with multiple models, only parse the first model
  let inFirstModel = true;
  const keepAltLoc = createAltLocFilter();
  let seenEndModel = false;

  for (const line of lines) {
    const recordType = line.substring(0, 6).trim();

    // Handle MODEL/ENDMDL records for NMR structures
    if (recordType === "MODEL") {
      // If we've already seen ENDMDL, this is model 2+
      if (seenEndModel) {
        inFirstModel = false;
      }
      continue;
    } else if (recordType === "ENDMDL") {
      seenEndModel = true;
      inFirstModel = false;
      continue;
    }

    if (recordType === "ATOM" || recordType === "HETATM") {
      // Skip atoms from models 2+ in NMR structures
      if (!inFirstModel) continue;

      const atom = parseAtomLine(line, atoms.length);
      if (atom && keepAltLoc(atom)) {
        // Assign secondary structure if we have SS data
        if (ssRanges.length > 0) {
          atom.secondaryStructure = getSecondaryStructure(
            atom.chainId,
            atom.residueNumber,
            atom.insertionCode,
            ssRanges
          );
        }
        serialToIndex.set(atom.serial!, atoms.length);
        atoms.push(atom);
      }
    } else if (recordType === "CONECT") {
      const serials = parseConnectLine(line);
      if (serials.length >= 2) {
        connectRecords.push(serials);
      }
    }
  }

  // Validate that we found at least one valid atom
  if (atoms.length === 0) {
    throw new Error('No valid atoms found in PDB file. The file may be malformed or empty.');
  }

  // Distance inference first, then CONECT on top: files often list CONECT
  // only for disulfides and ligands (1CRN has its 3 disulfides and nothing
  // else), and a CONECT bond can be longer than the inference cutoff.
  const bonds: Bond[] = opts.inferBonds ? inferBondsFromDistance(atoms, opts.bondTolerance!) : [];

  if (connectRecords.length > 0) {
    // Built only here: files without CONECT records (simulation and tool
    // output) skip it. wwPDB files list CONECT for hetero groups and
    // disulfides, so they build it. A pair's key is a number, exact below
    // 2^53 for any atom count this app loads.
    const n = atoms.length;
    const pairKey = (a: number, b: number) => Math.min(a, b) * n + Math.max(a, b);
    const bondSet = new Set<number>(bonds.map((b) => pairKey(b.atom1Index, b.atom2Index)));
    for (const serials of connectRecords) {
      const primaryIndex = serialToIndex.get(serials[0]);
      if (primaryIndex === undefined) continue;

      for (let i = 1; i < serials.length; i++) {
        const bondedIndex = serialToIndex.get(serials[i]);
        if (bondedIndex === undefined) continue;

        const key = pairKey(primaryIndex, bondedIndex);
        if (!bondSet.has(key)) {
          bondSet.add(key);
          bonds.push({
            atom1Index: primaryIndex,
            atom2Index: bondedIndex,
            order: 1,
          });
        }
      }
    }
  }

  // Parse biological assembly information
  let assemblies: BiologicalAssembly[] | undefined;
  if (opts.parseAssemblies) {
    assemblies = parseBIOMTRecords(lines);
    if (assemblies.length === 0) {
      assemblies = undefined;
    } else {
      // Log assembly info for debugging
      const totalCopies = assemblies.reduce((sum, a) => sum + a.copyCount, 0);
      if (totalCopies > 1) {
        console.log(
          `[PDB Parser] Found ${assemblies.length} biological assembly(ies) with ${totalCopies} total transforms`
        );
      }
    }
  }

  return {
    name: moleculeName,
    atoms,
    bonds,
    assemblies,
  };
}
