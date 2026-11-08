import type { SecondaryStructure } from "../types";
import { compareResidueIds } from "../utils/residueAnalysis";

/** A helix or sheet strand as a file lists it (PDB HELIX/SHEET, mmCIF struct_conf/struct_sheet_range). */
export interface SecondaryStructureRange {
  type: SecondaryStructure;
  chainId: string;
  startResNum: number;
  startInsertionCode?: string;
  endResNum: number;
  endInsertionCode?: string;
}

/**
 * The secondary structure of a residue from the file's ranges: the first
 * range that holds it, 'coil' when the file has ranges but none holds it,
 * undefined without a residue number or without ranges.
 */
export function secondaryStructureAt(
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
      // A blank chain ID is '' in the ranges and undefined on atoms
      (range.chainId || '') === (chainId || '') &&
      // Number, then insertion code: a range ending at 52B covers 52A, one starting at 52A leaves 52 out
      compareResidueIds(residueNumber, insertionCode, range.startResNum, range.startInsertionCode) >= 0 &&
      compareResidueIds(residueNumber, insertionCode, range.endResNum, range.endInsertionCode) <= 0
    ) {
      return range.type;
    }
  }

  return 'coil';
}
