import type { Atom, Bond, Molecule } from "../types";
import { PARSER_CONFIG } from "../config";
import { normalizeElementSymbol } from "../constants";
import { inferBondsFromDistance } from "../utils/bondInference";
import { createAltLocFilter } from "./altLoc";
import { secondaryStructureAt, type SecondaryStructureRange } from "./secondaryStructureRanges";

export interface MMCIFParserOptions {
  inferBonds?: boolean;
  bondTolerance?: number;
  /** Placeholder for future assembly support (not implemented in v1) */
  parseAssemblies?: boolean;
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
  const insCodeIdx = columnMap.get('_atom_site.pdbx_PDB_ins_code');

  let atomIndex = 0;
  let firstModel: string | null = null;
  const keepAltLoc = createAltLocFilter();

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
    // '?' and '.' (parseValue's null) mean no insertion code
    const insertionCode = (insCodeIdx !== undefined ? parseValue(tokens[insCodeIdx]) : null) || undefined;

    // One alternate location per residue (the first seen), so a residue
    // whose only conformer is B is kept
    const altLoc = (altIdIdx !== undefined ? parseValue(tokens[altIdIdx]) : null) || undefined;
    if (!keepAltLoc({ altLoc, chainId, residueNumber, insertionCode })) {
      i++;
      continue;
    }

    // 0 is a real occupancy; '?' and '.' (and a missing column) mean 1
    const occupancyValue = occupancyIdx !== undefined ? parseFloat(tokens[occupancyIdx]) : NaN;
    const occupancy = Number.isFinite(occupancyValue) ? occupancyValue : 1;
    const tempFactor = bFactorIdx !== undefined ? parseFloat(tokens[bFactorIdx]) : undefined;

    atoms.push({
      id: atomIndex,
      serial: isNaN(serial) ? atomIndex + 1 : serial,
      name,
      element: normalizeElementSymbol(element),
      x,
      y,
      z,
      residueName,
      residueNumber: isNaN(residueNumber!) ? undefined : residueNumber,
      ...(insertionCode ? { insertionCode } : {}),
      chainId,
      occupancy,
      ...(altLoc ? { altLoc } : {}),
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
  const begInsIdx = columnMap.get('_struct_conf.pdbx_beg_PDB_ins_code');
  const endInsIdx = columnMap.get('_struct_conf.pdbx_end_PDB_ins_code');

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
            startInsertionCode: (begInsIdx !== undefined ? parseValue(tokens[begInsIdx]) : null) || undefined,
            endResNum: endRes,
            endInsertionCode: (endInsIdx !== undefined ? parseValue(tokens[endInsIdx]) : null) || undefined,
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
  const begInsIdx = columnMap.get('_struct_sheet_range.pdbx_beg_PDB_ins_code');
  const endInsIdx = columnMap.get('_struct_sheet_range.pdbx_end_PDB_ins_code');

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
          startInsertionCode: (begInsIdx !== undefined ? parseValue(tokens[begInsIdx]) : null) || undefined,
          endResNum: endRes,
          endInsertionCode: (endInsIdx !== undefined ? parseValue(tokens[endInsIdx]) : null) || undefined,
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
    const ss = secondaryStructureAt(atom.chainId, atom.residueNumber, atom.insertionCode, ranges);
    if (ss) atom.secondaryStructure = ss;
  }
}

/**
 * Read a category written as key-value pairs (no loop_): one row, used by
 * files with a single helix, sheet strand or atom. A value is on the key's
 * line, on the next line, or in a ';' text field. Returns the keys and the
 * row as a header plus one data line, so the loop parsers above can read
 * it, and the index after the block.
 */
function readKeyValueBlock(lines: string[], startIndex: number, prefix: string): { loopLines: string[]; endIndex: number } {
  const keys: string[] = [];
  const values: string[] = [];
  let i = startIndex;
  while (i < lines.length && lines[i].trim().startsWith(prefix)) {
    const line = lines[i].trim();
    const key = line.split(/\s+/, 1)[0];
    const rest = line.slice(key.length).trim();
    i++;
    // Each value as one token of the data line
    let value: string;
    if (rest) {
      value = tokenizeLine(rest)[0];
    } else if (i < lines.length && lines[i].startsWith(';')) {
      // Text field: from ';' to a line holding only ';'
      const text = [lines[i].slice(1)];
      i++;
      while (i < lines.length && !lines[i].startsWith(';')) text.push(lines[i++]);
      i++; // the closing ';'
      value = quoteTextField(text.join(' ').trim());
    } else {
      value = tokenizeLine(lines[i]?.trim() ?? '')[0] ?? '?';
      i++;
    }
    keys.push(key);
    values.push(value);
  }
  return { loopLines: [...keys, values.join(' ')], endIndex: i };
}

/**
 * A ';' text field as one token of a data line, always quoted (it may start
 * with a quote and still hold spaces: `'A' and B`). A quote closes a token
 * only before whitespace (tokenizeLine), so double quotes carry any text
 * without `"` followed by whitespace, and single quotes any text without
 * `'` followed by whitespace. Text holding both can't be written on one
 * line, so it is unknown ('?').
 */
function quoteTextField(text: string): string {
  if (text === '') return '?';
  if (!/"\s/.test(text)) return `"${text}"`;
  if (!/'\s/.test(text)) return `'${text}'`;
  return '?';
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
      // What kind of loop this is: its first header, past any blank or
      // comment lines (CIF allows them; read as key-value pairs, the headers
      // would pair up two by two)
      let header = i + 1;
      while (header < lines.length && (!lines[header].trim() || lines[header].trim().startsWith('#'))) header++;
      if (header < lines.length) {
        const nextLine = lines[header].trim();

        if (nextLine.startsWith('_atom_site.')) {
          const result = parseAtomSiteLoop(lines, header);
          atoms = result.atoms;
          i = result.endIndex - 1;
        } else if (nextLine.startsWith('_struct_conf.')) {
          const result = parseStructConf(lines, header);
          ssRanges.push(...result.ranges);
          i = result.endIndex - 1;
        } else if (nextLine.startsWith('_struct_sheet_range.')) {
          const result = parseStructSheetRange(lines, header);
          ssRanges.push(...result.ranges);
          i = result.endIndex - 1;
        }
      }
    }

    // The same categories written as key-value pairs (a single row, no loop_)
    if (line.startsWith('_atom_site.')) {
      const { loopLines, endIndex } = readKeyValueBlock(lines, i, '_atom_site.');
      atoms = parseAtomSiteLoop(loopLines, 0).atoms;
      i = endIndex - 1;
      continue;
    } else if (line.startsWith('_struct_conf.')) {
      const { loopLines, endIndex } = readKeyValueBlock(lines, i, '_struct_conf.');
      ssRanges.push(...parseStructConf(loopLines, 0).ranges);
      i = endIndex - 1;
      continue;
    } else if (line.startsWith('_struct_sheet_range.')) {
      const { loopLines, endIndex } = readKeyValueBlock(lines, i, '_struct_sheet_range.');
      ssRanges.push(...parseStructSheetRange(loopLines, 0).ranges);
      i = endIndex - 1;
      continue;
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
