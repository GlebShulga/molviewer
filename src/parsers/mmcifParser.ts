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

/** A loop's column headers: where each column is, and where the data rows start. */
interface LoopHeader {
  /** Index of a column by its name after the category prefix (e.g. 'Cartn_x'). */
  col(name: string): number | undefined;
  /** Number of columns: a row with fewer values is skipped. */
  width: number;
  /** Index of the first line after the headers. */
  dataStart: number;
}

/**
 * Read a loop's column headers from `start`, matched on the trimmed line like
 * the loop detection in parseMMCIF and readKeyValueBlock, so an indented
 * header is read too.
 */
function readLoopHeader(lines: string[], start: number, prefix: string): LoopHeader {
  const columns = new Map<string, number>();
  let i = start;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.startsWith(prefix)) break;
    columns.set(line.slice(prefix.length), columns.size);
    i++;
  }
  return { col: (name) => columns.get(name), width: columns.size, dataStart: i };
}

/**
 * Call `onRow` with the values of each data row, one row at a time (an atom
 * loop can hold hundreds of thousands of rows), skipping blank lines and rows
 * with fewer than `width` values. Returns the index of the line that ended the
 * loop (the next `loop_`, `data_`, `#` or `_` line), or `lines.length`.
 */
function forEachLoopRow(lines: string[], dataStart: number, width: number, onRow: (tokens: string[]) => void): number {
  let i = dataStart;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('loop_') || line.startsWith('data_') || line.startsWith('#') || line.startsWith('_')) break;
    if (!line) continue;
    const tokens = tokenizeLine(line);
    if (tokens.length >= width) onRow(tokens);
  }
  return i;
}

/**
 * The first value among the given columns that is present and not `.`/`?`
 * (or empty): `first(tokens, auth, label)` prefers the auth_ column and falls
 * back to the label_ one.
 */
function first(tokens: string[], ...indices: (number | undefined)[]): string | null {
  for (const index of indices) {
    if (index === undefined) continue;
    const value = parseValue(tokens[index]);
    if (value) return value;
  }
  return null;
}

/**
 * Parse the _atom_site loop to extract atom data
 */
function parseAtomSiteLoop(lines: string[], startIndex: number): { atoms: Atom[], endIndex: number } {
  const atoms: Atom[] = [];
  const { col, width, dataStart } = readLoopHeader(lines, startIndex, '_atom_site.');

  // Required columns
  const cartnXIdx = col('Cartn_x');
  const cartnYIdx = col('Cartn_y');
  const cartnZIdx = col('Cartn_z');
  if (cartnXIdx === undefined || cartnYIdx === undefined || cartnZIdx === undefined) {
    const missing = ['Cartn_x', 'Cartn_y', 'Cartn_z'].find((name) => col(name) === undefined);
    throw new Error(`Missing required column: _atom_site.${missing}`);
  }

  // Column indices (with fallbacks)
  const idIdx = col('id');
  const typeSymbolIdx = col('type_symbol');
  const labelAtomIdIdx = col('label_atom_id');
  const labelCompIdIdx = col('label_comp_id');
  const authAsymIdIdx = col('auth_asym_id');
  const labelAsymIdIdx = col('label_asym_id');
  const authSeqIdIdx = col('auth_seq_id');
  const labelSeqIdIdx = col('label_seq_id');
  const occupancyIdx = col('occupancy');
  const bFactorIdx = col('B_iso_or_equiv');
  const modelNumIdx = col('pdbx_PDB_model_num');
  const altIdIdx = col('label_alt_id');
  const insCodeIdx = col('pdbx_PDB_ins_code');

  let firstModel: string | null = null;
  const keepAltLoc = createAltLocFilter();

  const endIndex = forEachLoopRow(lines, dataStart, width, (tokens) => {
    // Handle multi-model structures (NMR): only parse first model
    const modelNum = first(tokens, modelNumIdx);
    if (modelNum !== null) {
      if (firstModel === null) {
        firstModel = modelNum;
      } else if (modelNum !== firstModel) {
        return; // Skip atoms from other models
      }
    }

    // Parse atom data
    const x = parseFloat(tokens[cartnXIdx]);
    const y = parseFloat(tokens[cartnYIdx]);
    const z = parseFloat(tokens[cartnZIdx]);
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;

    const atomIndex = atoms.length;
    const serial = idIdx !== undefined ? parseInt(tokens[idIdx], 10) : atomIndex + 1;
    const element = first(tokens, typeSymbolIdx) || 'C';
    const name = first(tokens, labelAtomIdIdx) || element;
    const residueName = first(tokens, labelCompIdIdx) || 'UNK';

    // Prefer auth_ fields with fallback to label_ fields
    const chainId = first(tokens, authAsymIdIdx, labelAsymIdIdx) || undefined;
    const residueNumberStr = first(tokens, authSeqIdIdx, labelSeqIdIdx);
    const residueNumber = residueNumberStr ? parseInt(residueNumberStr, 10) : undefined;
    // '?' and '.' (parseValue's null) mean no insertion code
    const insertionCode = first(tokens, insCodeIdx) || undefined;

    // One alternate location per residue (the first seen), so a residue
    // whose only conformer is B is kept
    const altLoc = first(tokens, altIdIdx) || undefined;
    if (!keepAltLoc({ altLoc, chainId, residueNumber, insertionCode, residueName })) return;

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
  });

  return { atoms, endIndex };
}

/** A category of secondary-structure ranges: helices or sheet strands. */
interface RangeCategory {
  prefix: string;
  type: SecondaryStructureRange['type'];
  /** Only rows whose value in this column starts with `typePrefix` (case-insensitive) are ranges. */
  typeColumn?: string;
  typePrefix?: string;
}

const RANGE_CATEGORIES: readonly RangeCategory[] = [
  // Only helix types (HELX_P, HELX_LH_PP_P, ...): turns share the category
  { prefix: '_struct_conf.', type: 'helix', typeColumn: 'conf_type_id', typePrefix: 'HELX' },
  { prefix: '_struct_sheet_range.', type: 'sheet' },
];

/**
 * Parse a _struct_conf or _struct_sheet_range loop into ranges: chain, start
 * and end residue (auth_ columns, else label_), with insertion codes.
 */
function parseRangeLoop(
  lines: string[],
  startIndex: number,
  { prefix, type, typeColumn, typePrefix = '' }: RangeCategory
): { ranges: SecondaryStructureRange[], endIndex: number } {
  const ranges: SecondaryStructureRange[] = [];
  const { col, width, dataStart } = readLoopHeader(lines, startIndex, prefix);
  const typeIdx = typeColumn === undefined ? undefined : col(typeColumn);
  const chainIdx = [col('beg_auth_asym_id'), col('beg_label_asym_id')];
  const startIdx = [col('beg_auth_seq_id'), col('beg_label_seq_id')];
  const endIdx = [col('end_auth_seq_id'), col('end_label_seq_id')];
  const startInsIdx = col('pdbx_beg_PDB_ins_code');
  const endInsIdx = col('pdbx_end_PDB_ins_code');

  const endIndex = forEachLoopRow(lines, dataStart, width, (tokens) => {
    // A row without a type (or without the column) is not a range of this type
    if (typeColumn !== undefined && !first(tokens, typeIdx)?.toUpperCase().startsWith(typePrefix)) return;
    const chainId = first(tokens, ...chainIdx);
    // A missing number ('') parses as NaN
    const startResNum = parseInt(first(tokens, ...startIdx) ?? '', 10);
    const endResNum = parseInt(first(tokens, ...endIdx) ?? '', 10);
    if (!chainId || isNaN(startResNum) || isNaN(endResNum)) return;
    ranges.push({
      type,
      chainId,
      startResNum,
      startInsertionCode: first(tokens, startInsIdx) ?? undefined,
      endResNum,
      endInsertionCode: first(tokens, endInsIdx) ?? undefined,
    });
  });

  return { ranges, endIndex };
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

  // The categories read, each from a loop (header lines from `start`) or a
  // key-value block (turned into the same shape); returns the end index
  const readers: { prefix: string; read: (block: string[], start: number) => number }[] = [
    {
      prefix: '_atom_site.',
      read: (block, start) => {
        const result = parseAtomSiteLoop(block, start);
        atoms = result.atoms;
        return result.endIndex;
      },
    },
    ...RANGE_CATEGORIES.map((category) => ({
      prefix: category.prefix,
      read: (block: string[], start: number) => {
        const result = parseRangeLoop(block, start, category);
        ssRanges.push(...result.ranges);
        return result.endIndex;
      },
    })),
  ];
  const readerFor = (text: string) => readers.find((r) => text.startsWith(r.prefix));

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
      const loopReader = header < lines.length ? readerFor(lines[header].trim()) : undefined;
      if (loopReader) i = loopReader.read(lines, header) - 1;
      continue;
    }

    // The same categories written as key-value pairs (a single row, no loop_)
    const reader = readerFor(line);
    if (reader) {
      const { loopLines, endIndex } = readKeyValueBlock(lines, i, reader.prefix);
      reader.read(loopLines, 0);
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
