/**
 * Shapes of the curated datasets in data/*.json. Generated and validated by
 * scripts/validate-ids.ts and scripts/validate-compounds.ts.
 */

export interface PdbSeed {
  id: string;
  /** RCSB struct.title as deposited (often all caps). */
  title: string;
  /** Latest revision date, YYYY-MM-DD. */
  revised: string;
  method?: string;
  resolution?: number;
}

export interface AfSeed {
  id: string;
  name: string;
  gene?: string;
  organism?: string;
  revised?: string;
  plddt?: { mean: number; veryHigh: number; confident: number; low: number; veryLow: number };
}

export interface CollectionItem {
  type: 'pdb' | 'af';
  id: string;
  label: string;
  note?: string;
}

export interface Collection {
  slug: string;
  title: string;
  intro: string;
  featured?: boolean;
  items: CollectionItem[];
}

export type CompoundCategory =
  | 'common-drugs'
  | 'school-chemistry'
  | 'neurotransmitters'
  | 'vitamins'
  | 'amino-acids'
  | 'sugars'
  | 'hormones'
  | 'natural-products'
  | 'stimulants'
  | 'solvents'
  | 'fatty-acids-lipids'
  | 'nucleotides'
  | 'dyes-pigments'
  | 'toxins-poisons'
  | 'food-flavor-fragrance';

export interface Compound {
  slug: string;
  cid: number;
  name: string;
  category: CompoundCategory;
  formula: string;
  weight: string;
  iupac: string;
  smiles: string;
  synonyms: string[];
  heavyAtoms: number;
}

export const COMPOUND_CATEGORY_LABELS: Record<CompoundCategory, string> = {
  'common-drugs': 'Common drugs',
  'school-chemistry': 'School chemistry',
  neurotransmitters: 'Neurotransmitters',
  vitamins: 'Vitamins',
  'amino-acids': 'Amino acids',
  sugars: 'Sugars',
  hormones: 'Hormones',
  'natural-products': 'Natural products',
  stimulants: 'Stimulants',
  solvents: 'Solvents',
  'fatty-acids-lipids': 'Fatty acids and lipids',
  nucleotides: 'Nucleotides and nucleobases',
  'dyes-pigments': 'Dyes and pigments',
  'toxins-poisons': 'Toxins and poisons',
  'food-flavor-fragrance': 'Food, flavor and fragrance',
};
