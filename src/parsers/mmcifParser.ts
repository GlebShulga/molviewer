import type { Atom, Bond, Molecule, SecondaryStructure } from "../types";
import { PARSER_CONFIG } from "../config";
import { inferBondsFromDistance } from "../utils";

export interface MMCIFParserOptions {
  inferBonds?: boolean;
  bondTolerance?: number;
  /** Placeholder for future assembly support (not implemented in v1) */
  parseAssemblies?: boolean;
}

interface SecondaryStructureRange {
  type: SecondaryStructure;
  chainId: string;
  startResNum: number;
  endResNum: number;
}

const DEFAULT_OPTIONS: MMCIFParserOptions = {
  inferBonds: true,
  bondTolerance: PARSER_CONFIG.bondTolerance,
  parseAssemblies: false,
};

/**
 * Parse a value from mmCIF, handling quoted strings and null values
 */
function parseValue(value: string): string | null {
  if (value === '.' || value === '?') {
    return null;
  }
  // Handle quoted strings
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Tokenize a data line, handling quoted values
 */
function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuote) {
      if (char === quoteChar && (i + 1 === line.length || line[i + 1] === ' ' || line[i + 1] === '\t')) {
        tokens.push(current + char);
        current = '';
        inQuote = false;
      } else {
        current += char;
      }
    } else if (char === "'" || char === '"') {
      if (current === '' || current.match(/^\s+$/)) {
        inQuote = true;
        quoteChar = char;
        current = char;
      } else {
        current += char;
      }
    } else if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse the _atom_site loop to extract atom data
 */
function parseAtomSiteLoop(lines: string[], startIndex: number): { atoms: Atom[], endIndex: number } {
  const atoms: Atom[] = [];
  const columnMap: Map<string, number> = new Map();

  // Parse column headers
  let i = startIndex;
  while (i < lines.length && lines[i].startsWith('_atom_site.')) {
    const columnName = lines[i].trim();
    columnMap.set(columnName, columnMap.size);
    i++;
  }

  // Required columns
  const requiredCols = ['_atom_site.Cartn_x', '_atom_site.Cartn_y', '_atom_site.Cartn_z'];
  for (const col of requiredCols) {
    if (!columnMap.has(col)) {
      throw new Error(`Missing required column: ${col}`);
    }
  }

  // Column indices (with fallbacks)
  const idIdx = columnMap.get('_atom_site.id');
  const typeSymbolIdx = columnMap.get('_atom_site.type_symbol');
  const labelAtomIdIdx = columnMap.get('_atom_site.label_atom_id');
  const labelCompIdIdx = columnMap.get('_atom_site.label_comp_id');
  const authAsymIdIdx = columnMap.get('_atom_site.auth_asym_id');
  const labelAsymIdIdx = columnMap.get('_atom_site.label_asym_id');
  const authSeqIdIdx = columnMap.get('_atom_site.auth_seq_id');
  const labelSeqIdIdx = columnMap.get('_atom_site.label_seq_id');
  const cartnXIdx = columnMap.get('_atom_site.Cartn_x')!;
  const cartnYIdx = columnMap.get('_atom_site.Cartn_y')!;
  const cartnZIdx = columnMap.get('_atom_site.Cartn_z')!;
  const occupancyIdx = columnMap.get('_atom_site.occupancy');
  const bFactorIdx = columnMap.get('_atom_site.B_iso_or_equiv');
  const modelNumIdx = columnMap.get('_atom_site.pdbx_PDB_model_num');
  const altIdIdx = columnMap.get('_atom_site.label_alt_id');

  let atomIndex = 0;
  let firstModel: string | null = null;

  // Parse data rows
  while (i < lines.length) {
    const line = lines[i].trim();

    // Stop at next loop_, data_, or # comment
    if (line.startsWith('loop_') || line.startsWith('data_') ||
        line.startsWith('#') || line.startsWith('_')) {
      break;
    }

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    const tokens = tokenizeLine(line);
    if (tokens.length < columnMap.size) {
      i++;
      continue;
    }

    // Handle multi-model structures (NMR): only parse first model
    if (modelNumIdx !== undefined) {
      const modelNum = parseValue(tokens[modelNumIdx]);
      if (modelNum !== null) {
        if (firstModel === null) {
          firstModel = modelNum;
        } else if (modelNum !== firstModel) {
          i++;
          continue; // Skip atoms from other models
        }
      }
    }

    // Filter alternate conformations: keep only '.' or 'A'
    if (altIdIdx !== undefined) {
      const altId = parseValue(tokens[altIdIdx]);
      if (altId !== null && altId !== 'A' && altId !== '.') {
        i++;
        continue;
      }
    }

    // Parse atom data
    const x = parseFloat(tokens[cartnXIdx]);
    const y = parseFloat(tokens[cartnYIdx]);
    const z = parseFloat(tokens[cartnZIdx]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      i++;
      continue;
    }

    const serial = idIdx !== undefined ? parseInt(tokens[idIdx], 10) : atomIndex + 1;
    const element = typeSymbolIdx !== undefined ? parseValue(tokens[typeSymbolIdx]) || 'C' : 'C';
    const name = labelAtomIdIdx !== undefined ? parseValue(tokens[labelAtomIdIdx]) || element : element;
    const residueName = labelCompIdIdx !== undefined ? parseValue(tokens[labelCompIdIdx]) || 'UNK' : 'UNK';

    // Prefer auth_ fields with fallback to label_ fields
    const chainId = (authAsymIdIdx !== undefined ? parseValue(tokens[authAsymIdIdx]) : null)
                 || (labelAsymIdIdx !== undefined ? parseValue(tokens[labelAsymIdIdx]) : null)
                 || undefined;

    const residueNumberStr = (authSeqIdIdx !== undefined ? parseValue(tokens[authSeqIdIdx]) : null)
                          || (labelSeqIdIdx !== undefined ? parseValue(tokens[labelSeqIdIdx]) : null);
    const residueNumber = residueNumberStr ? parseInt(residueNumberStr, 10) : undefined;

    const occupancy = occupancyIdx !== undefined ? parseFloat(tokens[occupancyIdx]) || 1.0 : 1.0;
    const tempFactor = bFactorIdx !== undefined ? parseFloat(tokens[bFactorIdx]) : undefined;

    atoms.push({
      id: atomIndex,
      serial: isNaN(serial) ? atomIndex + 1 : serial,
      name,
      element: element.charAt(0).toUpperCase() + element.slice(1).toLowerCase(),
      x,
      y,
      z,
      residueName,
      residueNumber: isNaN(residueNumber!) ? undefined : residueNumber,
      chainId,
      occupancy,
      tempFactor: isNaN(tempFactor!) ? undefined : tempFactor,
    });

    atomIndex++;
    i++;
  }

  return { atoms, endIndex: i };
}

/**
 * Parse _struct_conf loop for helix records
 */
function parseStructConf(lines: string[], startIndex: number): { ranges: SecondaryStructureRange[], endIndex: number } {
  const ranges: SecondaryStructureRange[] = [];
  const columnMap: Map<string, number> = new Map();

  // Parse column headers
  let i = startIndex;
  while (i < lines.length && lines[i].startsWith('_struct_conf.')) {
    const columnName = lines[i].trim();
    columnMap.set(columnName, columnMap.size);
    i++;
  }

  const confTypeIdx = columnMap.get('_struct_conf.conf_type_id');
  const begAuthAsymIdx = columnMap.get('_struct_conf.beg_auth_asym_id');
  const begLabelAsymIdx = columnMap.get('_struct_conf.beg_label_asym_id');
  const begAuthSeqIdx = columnMap.get('_struct_conf.beg_auth_seq_id');
  const begLabelSeqIdx = columnMap.get('_struct_conf.beg_label_seq_id');
  const endAuthSeqIdx = columnMap.get('_struct_conf.end_auth_seq_id');
  const endLabelSeqIdx = columnMap.get('_struct_conf.end_label_seq_id');

  // Parse data rows
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('loop_') || line.startsWith('data_') ||
        line.startsWith('#') || line.startsWith('_')) {
      break;
    }

    if (!line) {
      i++;
      continue;
    }

    const tokens = tokenizeLine(line);
    if (tokens.length < columnMap.size) {
      i++;
      continue;
    }

    const confType = confTypeIdx !== undefined ? parseValue(tokens[confTypeIdx]) : null;

    // Only parse helix types (HELX_*, HELIX, etc.)
    if (confType && confType.toUpperCase().startsWith('HELX')) {
      const chainId = (begAuthAsymIdx !== undefined ? parseValue(tokens[begAuthAsymIdx]) : null)
                   || (begLabelAsymIdx !== undefined ? parseValue(tokens[begLabelAsymIdx]) : null);

      const startResStr = (begAuthSeqIdx !== undefined ? parseValue(tokens[begAuthSeqIdx]) : null)
                       || (begLabelSeqIdx !== undefined ? parseValue(tokens[begLabelSeqIdx]) : null);

      const endResStr = (endAuthSeqIdx !== undefined ? parseValue(tokens[endAuthSeqIdx]) : null)
                     || (endLabelSeqIdx !== undefined ? parseValue(tokens[endLabelSeqIdx]) : null);

      if (chainId && startResStr && endResStr) {
        const startRes = parseInt(startResStr, 10);
        const endRes = parseInt(endResStr, 10);
        if (!isNaN(startRes) && !isNaN(endRes)) {
          ranges.push({
            type: 'helix',
            chainId,
            startResNum: startRes,
            endResNum: endRes,
          });
        }
      }
    }

    i++;
  }

  return { ranges, endIndex: i };
}

/**
 * Parse _struct_sheet_range loop for sheet records
 */
function parseStructSheetRange(lines: string[], startIndex: number): { ranges: SecondaryStructureRange[], endIndex: number } {
  const ranges: SecondaryStructureRange[] = [];
  const columnMap: Map<string, number> = new Map();

  // Parse column headers
  let i = startIndex;
  while (i < lines.length && lines[i].startsWith('_struct_sheet_range.')) {
    const columnName = lines[i].trim();
    columnMap.set(columnName, columnMap.size);
    i++;
  }

  const begAuthAsymIdx = columnMap.get('_struct_sheet_range.beg_auth_asym_id');
  const begLabelAsymIdx = columnMap.get('_struct_sheet_range.beg_label_asym_id');
  const begAuthSeqIdx = columnMap.get('_struct_sheet_range.beg_auth_seq_id');
  const begLabelSeqIdx = columnMap.get('_struct_sheet_range.beg_label_seq_id');
  const endAuthSeqIdx = columnMap.get('_struct_sheet_range.end_auth_seq_id');
  const endLabelSeqIdx = columnMap.get('_struct_sheet_range.end_label_seq_id');

  // Parse data rows
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('loop_') || line.startsWith('data_') ||
        line.startsWith('#') || line.startsWith('_')) {
      break;
    }

    if (!line) {
      i++;
      continue;
    }

    const tokens = tokenizeLine(line);
    if (tokens.length < columnMap.size) {
      i++;
      continue;
    }

    const chainId = (begAuthAsymIdx !== undefined ? parseValue(tokens[begAuthAsymIdx]) : null)
                 || (begLabelAsymIdx !== undefined ? parseValue(tokens[begLabelAsymIdx]) : null);

    const startResStr = (begAuthSeqIdx !== undefined ? parseValue(tokens[begAuthSeqIdx]) : null)
                     || (begLabelSeqIdx !== undefined ? parseValue(tokens[begLabelSeqIdx]) : null);

    const endResStr = (endAuthSeqIdx !== undefined ? parseValue(tokens[endAuthSeqIdx]) : null)
                   || (endLabelSeqIdx !== undefined ? parseValue(tokens[endLabelSeqIdx]) : null);

    if (chainId && startResStr && endResStr) {
      const startRes = parseInt(startResStr, 10);
      const endRes = parseInt(endResStr, 10);
      if (!isNaN(startRes) && !isNaN(endRes)) {
        ranges.push({
          type: 'sheet',
          chainId,
          startResNum: startRes,
          endResNum: endRes,
        });
      }
    }

    i++;
  }

  return { ranges, endIndex: i };
}

/**
 * Assign secondary structure to atoms based on parsed ranges
 */
function assignSecondaryStructure(atoms: Atom[], ranges: SecondaryStructureRange[]): void {
  if (ranges.length === 0) return;

  for (const atom of atoms) {
    if (!atom.chainId || atom.residueNumber === undefined) continue;

    for (const range of ranges) {
      if (
        range.chainId === atom.chainId &&
        atom.residueNumber >= range.startResNum &&
        atom.residueNumber <= range.endResNum
      ) {
        atom.secondaryStructure = range.type;
        break;
      }
    }

    // If we have SS data but this residue isn't in helix/sheet, it's a coil
    if (atom.secondaryStructure === undefined) {
      atom.secondaryStructure = 'coil';
    }
  }
}

/**
 * Parse mmCIF/PDBx format file content
 */
export function parseMMCIF(
  content: string,
  options: MMCIFParserOptions = {}
): Molecule {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = content.split(/\r?\n/);

  let atoms: Atom[] = [];
  const ssRanges: SecondaryStructureRange[] = [];
  let moleculeName = 'Molecule';

  // Find data block name
  for (const line of lines) {
    if (line.startsWith('data_')) {
      moleculeName = line.substring(5).trim() || moleculeName;
      break;
    }
  }

  // Parse the file
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for loop_ blocks
    if (line === 'loop_') {
      // Check what kind of loop this is by looking at the next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();

        if (nextLine.startsWith('_atom_site.')) {
          const result = parseAtomSiteLoop(lines, i + 1);
          atoms = result.atoms;
          i = result.endIndex - 1;
        } else if (nextLine.startsWith('_struct_conf.')) {
          const result = parseStructConf(lines, i + 1);
          ssRanges.push(...result.ranges);
          i = result.endIndex - 1;
        } else if (nextLine.startsWith('_struct_sheet_range.')) {
          const result = parseStructSheetRange(lines, i + 1);
          ssRanges.push(...result.ranges);
          i = result.endIndex - 1;
        }
      }
    }

    // Also check for _entry.id for molecule name
    if (line.startsWith('_entry.id')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        moleculeName = parseValue(parts[1]) || moleculeName;
      }
    }
  }

  // Validate that we found atoms
  if (atoms.length === 0) {
    throw new Error('No valid atoms found in mmCIF file. The file may be malformed or empty.');
  }

  // Assign secondary structure
  assignSecondaryStructure(atoms, ssRanges);

  // Infer bonds
  let bonds: Bond[] = [];
  if (opts.inferBonds) {
    bonds = inferBondsFromDistance(atoms, opts.bondTolerance!);
  }

  return {
    name: moleculeName,
    atoms,
    bonds,
  };
}
