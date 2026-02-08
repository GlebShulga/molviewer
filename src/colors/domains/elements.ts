export interface ElementData {
  symbol: string;
  name: string;
  atomicNumber: number;
  atomicMass: number;
  color: string;
  uiColor?: string; // Alternative color for UI elements (better visibility in light mode)
  vdwRadius: number;
  covalentRadius: number;
}

export const ELEMENTS: Record<string, ElementData> = {
  H: {
    symbol: "H",
    name: "Hydrogen",
    atomicNumber: 1,
    atomicMass: 1.008,
    color: "#FFFFFF",
    vdwRadius: 1.2,
    covalentRadius: 0.31,
  },
  He: {
    symbol: "He",
    name: "Helium",
    atomicNumber: 2,
    atomicMass: 4.003,
    color: "#D9FFFF",
    vdwRadius: 1.4,
    covalentRadius: 0.28,
  },
  Li: {
    symbol: "Li",
    name: "Lithium",
    atomicNumber: 3,
    atomicMass: 6.941,
    color: "#CC80FF",
    vdwRadius: 1.82,
    covalentRadius: 1.28,
  },
  Be: {
    symbol: "Be",
    name: "Beryllium",
    atomicNumber: 4,
    atomicMass: 9.012,
    color: "#C2FF00",
    vdwRadius: 1.53,
    covalentRadius: 0.96,
  },
  B: {
    symbol: "B",
    name: "Boron",
    atomicNumber: 5,
    atomicMass: 10.81,
    color: "#FFB5B5",
    vdwRadius: 1.92,
    covalentRadius: 0.84,
  },
  C: {
    symbol: "C",
    name: "Carbon",
    atomicNumber: 6,
    atomicMass: 12.011,
    color: "#909090",
    vdwRadius: 1.7,
    covalentRadius: 0.76,
  },
  N: {
    symbol: "N",
    name: "Nitrogen",
    atomicNumber: 7,
    atomicMass: 14.007,
    color: "#3050F8",
    vdwRadius: 1.55,
    covalentRadius: 0.71,
  },
  O: {
    symbol: "O",
    name: "Oxygen",
    atomicNumber: 8,
    atomicMass: 15.999,
    color: "#FF0D0D",
    vdwRadius: 1.52,
    covalentRadius: 0.66,
  },
  F: {
    symbol: "F",
    name: "Fluorine",
    atomicNumber: 9,
    atomicMass: 18.998,
    color: "#90E050",
    vdwRadius: 1.47,
    covalentRadius: 0.57,
  },
  Ne: {
    symbol: "Ne",
    name: "Neon",
    atomicNumber: 10,
    atomicMass: 20.18,
    color: "#B3E3F5",
    vdwRadius: 1.54,
    covalentRadius: 0.58,
  },
  Na: {
    symbol: "Na",
    name: "Sodium",
    atomicNumber: 11,
    atomicMass: 22.99,
    color: "#AB5CF2",
    vdwRadius: 2.27,
    covalentRadius: 1.66,
  },
  Mg: {
    symbol: "Mg",
    name: "Magnesium",
    atomicNumber: 12,
    atomicMass: 24.305,
    color: "#8AFF00",
    vdwRadius: 1.73,
    covalentRadius: 1.41,
  },
  Al: {
    symbol: "Al",
    name: "Aluminum",
    atomicNumber: 13,
    atomicMass: 26.982,
    color: "#BFA6A6",
    vdwRadius: 1.84,
    covalentRadius: 1.21,
  },
  Si: {
    symbol: "Si",
    name: "Silicon",
    atomicNumber: 14,
    atomicMass: 28.086,
    color: "#F0C8A0",
    vdwRadius: 2.1,
    covalentRadius: 1.11,
  },
  P: {
    symbol: "P",
    name: "Phosphorus",
    atomicNumber: 15,
    atomicMass: 30.974,
    color: "#FF8000",
    vdwRadius: 1.8,
    covalentRadius: 1.07,
  },
  S: {
    symbol: "S",
    name: "Sulfur",
    atomicNumber: 16,
    atomicMass: 32.065,
    color: "#FFFF30",
    uiColor: "#B8860B", // Dark goldenrod - visible in light mode
    vdwRadius: 1.8,
    covalentRadius: 1.05,
  },
  Cl: {
    symbol: "Cl",
    name: "Chlorine",
    atomicNumber: 17,
    atomicMass: 35.453,
    color: "#1FF01F",
    vdwRadius: 1.75,
    covalentRadius: 1.02,
  },
  Ar: {
    symbol: "Ar",
    name: "Argon",
    atomicNumber: 18,
    atomicMass: 39.948,
    color: "#80D1E3",
    vdwRadius: 1.88,
    covalentRadius: 1.06,
  },
  K: {
    symbol: "K",
    name: "Potassium",
    atomicNumber: 19,
    atomicMass: 39.098,
    color: "#8F40D4",
    vdwRadius: 2.75,
    covalentRadius: 2.03,
  },
  Ca: {
    symbol: "Ca",
    name: "Calcium",
    atomicNumber: 20,
    atomicMass: 40.078,
    color: "#3DFF00",
    vdwRadius: 2.31,
    covalentRadius: 1.76,
  },
  Fe: {
    symbol: "Fe",
    name: "Iron",
    atomicNumber: 26,
    atomicMass: 55.845,
    color: "#E06633",
    vdwRadius: 2.04,
    covalentRadius: 1.32,
  },
  Co: {
    symbol: "Co",
    name: "Cobalt",
    atomicNumber: 27,
    atomicMass: 58.933,
    color: "#F090A0",
    vdwRadius: 2.0,
    covalentRadius: 1.26,
  },
  Ni: {
    symbol: "Ni",
    name: "Nickel",
    atomicNumber: 28,
    atomicMass: 58.693,
    color: "#50D050",
    vdwRadius: 1.97,
    covalentRadius: 1.24,
  },
  Cu: {
    symbol: "Cu",
    name: "Copper",
    atomicNumber: 29,
    atomicMass: 63.546,
    color: "#C88033",
    vdwRadius: 1.96,
    covalentRadius: 1.32,
  },
  Zn: {
    symbol: "Zn",
    name: "Zinc",
    atomicNumber: 30,
    atomicMass: 65.38,
    color: "#7D80B0",
    vdwRadius: 2.01,
    covalentRadius: 1.22,
  },
  Br: {
    symbol: "Br",
    name: "Bromine",
    atomicNumber: 35,
    atomicMass: 79.904,
    color: "#A62929",
    vdwRadius: 1.85,
    covalentRadius: 1.2,
  },
  I: {
    symbol: "I",
    name: "Iodine",
    atomicNumber: 53,
    atomicMass: 126.904,
    color: "#940094",
    vdwRadius: 1.98,
    covalentRadius: 1.39,
  },
};

export const DEFAULT_ELEMENT: ElementData = {
  symbol: "X",
  name: "Unknown",
  atomicNumber: 0,
  atomicMass: 0,
  color: "#FF1493",
  vdwRadius: 1.5,
  covalentRadius: 0.75,
};

export function getElement(symbol: string): ElementData {
  const normalized = symbol.charAt(0).toUpperCase() + symbol.slice(1).toLowerCase();
  return ELEMENTS[normalized] ?? ELEMENTS[symbol.toUpperCase()] ?? DEFAULT_ELEMENT;
}

export function getElementColor(symbol: string): string {
  return getElement(symbol).color;
}

export function getVdwRadius(symbol: string): number {
  return getElement(symbol).vdwRadius;
}

export function getCovalentRadius(symbol: string): number {
  return getElement(symbol).covalentRadius;
}
