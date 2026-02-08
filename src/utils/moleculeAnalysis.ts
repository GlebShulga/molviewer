import type { Molecule } from '../types';
import { getElement, type ElementData } from '../constants/elements';

export interface ElementCount {
  element: string;
  count: number;
  data: ElementData;
}

export interface BondCount {
  order: 1 | 2 | 3;
  count: number;
  label: string;
}

export interface ChainSummary {
  chainId: string;
  residueCount: number;
  atomCount: number;
}

export interface MoleculeAnalysis {
  formula: string;
  molecularWeight: number;
  elementCounts: ElementCount[];
  bondCounts: BondCount[];
  chainSummary: ChainSummary[];
  totalAtoms: number;
  totalBonds: number;
}

const BOND_LABELS: Record<number, string> = {
  1: 'Single',
  2: 'Double',
  3: 'Triple',
};

export function analyzeMolecule(molecule: Molecule): MoleculeAnalysis {
  const elementMap = new Map<string, number>();

  for (const atom of molecule.atoms) {
    const current = elementMap.get(atom.element) || 0;
    elementMap.set(atom.element, current + 1);
  }

  const elementCounts: ElementCount[] = Array.from(elementMap.entries())
    .map(([element, count]) => ({
      element,
      count,
      data: getElement(element),
    }))
    .sort((a, b) => {
      if (a.element === 'C') return -1;
      if (b.element === 'C') return 1;
      if (a.element === 'H') return -1;
      if (b.element === 'H') return 1;
      return a.element.localeCompare(b.element);
    });

  const formula = generateMolecularFormula(elementCounts);
  const molecularWeight = calculateMolecularWeight(elementCounts);

  const bondMap = new Map<number, number>();
  for (const bond of molecule.bonds) {
    const current = bondMap.get(bond.order) || 0;
    bondMap.set(bond.order, current + 1);
  }

  const bondCounts: BondCount[] = ([1, 2, 3] as const)
    .filter((order) => bondMap.has(order))
    .map((order) => ({
      order,
      count: bondMap.get(order) || 0,
      label: BOND_LABELS[order],
    }));

  const chainSummary = analyzeChains(molecule);

  return {
    formula,
    molecularWeight,
    elementCounts,
    bondCounts,
    chainSummary,
    totalAtoms: molecule.atoms.length,
    totalBonds: molecule.bonds.length,
  };
}

function generateMolecularFormula(elementCounts: ElementCount[]): string {
  return elementCounts
    .map(({ element, count }) => {
      if (count === 1) return element;
      return `${element}${subscript(count)}`;
    })
    .join('');
}

function subscript(num: number): string {
  const subscripts = '₀₁₂₃₄₅₆₇₈₉';
  return String(num)
    .split('')
    .map((d) => subscripts[parseInt(d)])
    .join('');
}

function calculateMolecularWeight(elementCounts: ElementCount[]): number {
  return elementCounts.reduce((total, { count, data }) => {
    return total + count * data.atomicMass;
  }, 0);
}

function analyzeChains(molecule: Molecule): ChainSummary[] {
  const chainMap = new Map<string, { residues: Set<string>; atoms: number }>();

  for (const atom of molecule.atoms) {
    const chainId = atom.chainId || 'Unknown';
    if (!chainMap.has(chainId)) {
      chainMap.set(chainId, { residues: new Set(), atoms: 0 });
    }
    const chain = chainMap.get(chainId)!;
    chain.atoms++;
    if (atom.residueName && atom.residueNumber !== undefined) {
      chain.residues.add(`${atom.residueName}${atom.residueNumber}`);
    }
  }

  return Array.from(chainMap.entries())
    .map(([chainId, data]) => ({
      chainId,
      residueCount: data.residues.size,
      atomCount: data.atoms,
    }))
    .sort((a, b) => a.chainId.localeCompare(b.chainId));
}

export function formatMolecularWeight(weight: number): string {
  return `${weight.toFixed(2)} g/mol`;
}
