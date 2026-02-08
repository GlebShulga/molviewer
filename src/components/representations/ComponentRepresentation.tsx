import type { Molecule } from '../../types';
import type { RepresentationType, ColorScheme } from '../../store/moleculeStore';
import { BallAndStick } from './BallAndStick';
import { Stick } from './Stick';
import { Spacefill } from './Spacefill';
import { Cartoon } from './Cartoon';

export interface ComponentRepresentationProps {
  molecule: Molecule;
  representation: RepresentationType;
  colorScheme: ColorScheme;
  atomIndices: number[];
  residueFilter?: Set<string>; // For Cartoon
  /** Structure ID for multi-structure support */
  structureId?: string;
}

/**
 * Routes to the correct representation component based on type.
 * Used by smart defaults mode to render each molecule component separately.
 */
export function ComponentRepresentation({
  molecule,
  representation,
  colorScheme,
  atomIndices,
  residueFilter,
  structureId,
}: ComponentRepresentationProps) {
  // Skip rendering if no atoms
  if (atomIndices.length === 0) {
    return null;
  }

  switch (representation) {
    case 'ball-and-stick':
      return (
        <BallAndStick
          molecule={molecule}
          colorScheme={colorScheme}
          atomIndices={atomIndices}
          structureId={structureId}
        />
      );

    case 'stick':
      return (
        <Stick
          molecule={molecule}
          colorScheme={colorScheme}
          atomIndices={atomIndices}
          structureId={structureId}
        />
      );

    case 'spacefill':
      return (
        <Spacefill
          molecule={molecule}
          colorScheme={colorScheme}
          atomIndices={atomIndices}
          structureId={structureId}
        />
      );

    case 'cartoon':
      return (
        <Cartoon
          molecule={molecule}
          colorScheme={colorScheme}
          residueFilter={residueFilter}
          structureId={structureId}
        />
      );

    // Surface representations fall back to ball-and-stick
    case 'surface-vdw':
    case 'surface-sas':
      return (
        <BallAndStick
          molecule={molecule}
          colorScheme={colorScheme}
          atomIndices={atomIndices}
          structureId={structureId}
        />
      );

    default:
      return (
        <BallAndStick
          molecule={molecule}
          colorScheme={colorScheme}
          atomIndices={atomIndices}
          structureId={structureId}
        />
      );
  }
}
