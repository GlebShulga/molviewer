import type { Atom, Bond } from '../types';
import { getElement, type ElementData } from '../constants/elements';

export interface AtomAnalysis {
  atom: Atom;
  element: ElementData;
  connectedAtomCount: number;
  bondOrders: number[];
}

export function analyzeAtom(
  atom: Atom,
  bonds: Bond[],
  atoms: Atom[]
): AtomAnalysis {
  const atomIndex = atoms.findIndex((a) => a.id === atom.id);
  const element = getElement(atom.element);

  const connectedBonds = bonds.filter(
    (bond) => bond.atom1Index === atomIndex || bond.atom2Index === atomIndex
  );

  const bondOrders = connectedBonds.map((bond) => bond.order);

  return {
    atom,
    element,
    connectedAtomCount: connectedBonds.length,
    bondOrders,
  };
}

export function formatAtomName(atom: Atom): string {
  if (atom.name) {
    return atom.name;
  }
  return atom.element;
}

export function formatResidueInfo(atom: Atom): string | null {
  if (!atom.residueName) return null;
  let info = atom.residueName;
  if (atom.residueNumber !== undefined) {
    info += ` ${atom.residueNumber}`;
  }
  if (atom.chainId) {
    info += ` (Chain ${atom.chainId})`;
  }
  return info;
}

export function formatCoordinates(atom: Atom, precision: number = 3): string {
  return `(${atom.x.toFixed(precision)}, ${atom.y.toFixed(precision)}, ${atom.z.toFixed(precision)})`;
}

export function formatOccupancy(occupancy: number | undefined): string {
  if (occupancy === undefined) return 'N/A';
  return `${(occupancy * 100).toFixed(1)}%`;
}

export function formatTempFactor(tempFactor: number | undefined): string {
  if (tempFactor === undefined) return 'N/A';
  return tempFactor.toFixed(2);
}
