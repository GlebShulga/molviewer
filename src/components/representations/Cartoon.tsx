import { useMemo } from 'react';
import * as THREE from 'three';
import type { Molecule } from '../../types';
import type { ColorScheme } from '../../store/moleculeStore';
import {
  extractBackbone,
  generateBackboneSpline,
  segmentSplineByStructure,
  generateHelixGeometry,
  generateSheetGeometry,
  generateCoilGeometry,
  getAtomColor,
  calculateColorSchemeContext,
  detectSecondaryStructure,
  type BackboneChain,
  type SplineSegment,
} from '../../utils';
import { SECONDARY_STRUCTURE_COLORS } from '../../colors';

export interface CartoonProps {
  molecule: Molecule;
  colorScheme?: ColorScheme;
  subdivisions?: number;
  residueFilter?: Set<string>; // Filter to render only these residues: "chainId:residueNumber"
  /** Structure ID for multi-structure support (unused in Cartoon but kept for API consistency) */
  structureId?: string;
}

interface SegmentMesh {
  geometry: THREE.BufferGeometry;
  color: THREE.Color;
  key: string;
  useVertexColors: boolean;
}

export function Cartoon({
  molecule,
  colorScheme = 'cpk',
  subdivisions = 4,
  residueFilter,
}: CartoonProps) {
  // Detect secondary structure if not already present
  const moleculeWithSS = useMemo(() => {
    const hasExistingSS = molecule.atoms.some((a) => a.secondaryStructure !== undefined);
    if (!hasExistingSS) {
      // Create a copy to avoid mutating original
      const copy = { ...molecule, atoms: molecule.atoms.map((a) => ({ ...a })) };
      detectSecondaryStructure(copy);
      return copy;
    }
    return molecule;
  }, [molecule]);

  // Calculate color context for color schemes
  const colorContext = useMemo(() => calculateColorSchemeContext(moleculeWithSS), [moleculeWithSS]);

  // Extract backbone chains and apply residue filter with gap handling
  const backbone = useMemo(() => {
    const chains = extractBackbone(moleculeWithSS);

    if (!residueFilter) return chains;

    const result: BackboneChain[] = [];

    for (const chain of chains) {
      // Filter residues
      const filtered = chain.residues.filter((r) =>
        residueFilter.has(`${r.chainId}:${r.residueNumber}`)
      );

      if (filtered.length < 2) continue;

      // Split into continuous segments (handle gaps from filtering)
      // If residue numbers jump by more than 1, start a new chain segment
      let currentSegment = [filtered[0]];

      for (let i = 1; i < filtered.length; i++) {
        const gap = filtered[i].residueNumber - filtered[i - 1].residueNumber;
        if (gap > 1) {
          // Gap detected - save current segment and start new one
          if (currentSegment.length >= 2) {
            result.push({ chainId: chain.chainId, residues: currentSegment });
          }
          currentSegment = [filtered[i]];
        } else {
          currentSegment.push(filtered[i]);
        }
      }

      // Don't forget last segment
      if (currentSegment.length >= 2) {
        result.push({ chainId: chain.chainId, residues: currentSegment });
      }
    }

    return result;
  }, [moleculeWithSS, residueFilter]);

  // Generate splines and segment by secondary structure
  const chainSegments = useMemo(() => {
    const result: { chain: BackboneChain; segments: SplineSegment[] }[] = [];

    for (const chain of backbone) {
      if (chain.residues.length < 2) continue;

      const spline = generateBackboneSpline(chain, subdivisions);
      const segments = segmentSplineByStructure(spline);

      result.push({ chain, segments });
    }

    return result;
  }, [backbone, subdivisions]);

  // Color schemes that need per-vertex colors (gradient along chain)
  const needsVertexColors =
    colorScheme === 'rainbow' ||
    colorScheme === 'chain' ||
    colorScheme === 'residueType' ||
    colorScheme === 'bfactor';

  // DEBUG: Log outside useMemo to see if component re-renders
  console.log('DEBUG Cartoon render:', { colorScheme, needsVertexColors });

  // Generate geometry meshes for each segment
  const segmentMeshes = useMemo<SegmentMesh[]>(() => {
    const meshes: SegmentMesh[] = [];

    // DEBUG: Log inside useMemo
    console.log('DEBUG segmentMeshes useMemo:', {
      colorScheme,
      needsVertexColors,
      chainSegmentsLength: chainSegments.length,
    });

    for (const { chain, segments } of chainSegments) {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.points.length < 2) continue;

        // For rainbow/chain coloring, calculate per-spline-point colors
        let splineColors: THREE.Color[] | undefined;

        if (needsVertexColors) {
          // DEBUG: Log first point of first segment to trace lookup
          if (i === 0 && meshes.length === 0) {
            const firstPoint = segment.points[0];
            console.log('DEBUG Cartoon colors:', {
              colorScheme,
              needsVertexColors,
              chainResiduesLength: chain.residues.length,
              pointResidueIndex: firstPoint.residueIndex,
              residue: chain.residues[firstPoint.residueIndex],
              atomIndex: chain.residues[firstPoint.residueIndex]?.atomIndex,
              atom:
                chain.residues[firstPoint.residueIndex]?.atomIndex !== undefined
                  ? moleculeWithSS.atoms[chain.residues[firstPoint.residueIndex].atomIndex]
                  : 'no atomIndex',
              totalAtoms: moleculeWithSS.atoms.length,
            });
          }

          splineColors = segment.points.map((point) => {
            // Find the residue for this spline point
            const residue = chain.residues[point.residueIndex];
            if (residue) {
              const atom = moleculeWithSS.atoms[residue.atomIndex];
              if (atom) {
                return new THREE.Color(getAtomColor(atom, colorScheme, colorContext));
              }
            }
            return new THREE.Color(SECONDARY_STRUCTURE_COLORS[segment.type]);
          });
        }

        // Generate appropriate geometry based on secondary structure type
        let geometry: THREE.BufferGeometry;
        switch (segment.type) {
          case 'helix':
            geometry = generateHelixGeometry(segment.points, undefined, undefined, splineColors);
            break;
          case 'sheet':
            geometry = generateSheetGeometry(
              segment.points,
              undefined,
              undefined,
              undefined,
              undefined,
              splineColors
            );
            break;
          case 'coil':
          default:
            geometry = generateCoilGeometry(segment.points, undefined, undefined, splineColors);
            break;
        }

        // Determine uniform color (used when not using vertex colors)
        let color: THREE.Color;

        if (colorScheme === 'secondaryStructure' || colorScheme === 'cpk') {
          // Use secondary structure coloring
          color = new THREE.Color(SECONDARY_STRUCTURE_COLORS[segment.type]);
        } else if (needsVertexColors) {
          // When using vertex colors, uniform color is white (it gets multiplied)
          color = new THREE.Color(0xffffff);
        } else {
          // Use representative atom from the segment for coloring
          const residue =
            chain.residues.find(
              (r) =>
                r.residueNumber >= segment.startResidueIndex &&
                r.residueNumber <= segment.endResidueIndex
            ) || chain.residues[0];

          const atom = moleculeWithSS.atoms[residue.atomIndex];
          if (atom) {
            color = new THREE.Color(getAtomColor(atom, colorScheme, colorContext));
          } else {
            color = new THREE.Color(SECONDARY_STRUCTURE_COLORS[segment.type]);
          }
        }

        meshes.push({
          geometry,
          color,
          key: `${chain.chainId}-${i}-${segment.type}-${colorScheme}`,
          useVertexColors: needsVertexColors && !!splineColors,
        });
      }
    }

    return meshes;
  }, [chainSegments, colorScheme, colorContext, moleculeWithSS, needsVertexColors]);

  // If no backbone data, show nothing
  if (backbone.length === 0) {
    return null;
  }

  return (
    <group>
      {segmentMeshes.map((mesh) => (
        <mesh key={mesh.key} geometry={mesh.geometry}>
          <meshStandardMaterial
            color={mesh.useVertexColors ? 0xffffff : mesh.color}
            vertexColors={mesh.useVertexColors}
            side={THREE.DoubleSide}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}
