import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { Molecule } from '../../types';
import type { ColorScheme } from '../../store/moleculeStore';
import { generateSurface, type SurfaceOptions, type SurfaceData } from '../../utils/surfaceGeneration';
import { calculateColorSchemeContext } from '../../utils/atomColor';
import { surfaceAtoms, surfaceVertexColors } from '../../utils/surfaceAtoms';
import type { ComponentSettings } from '../../utils/moleculeTypeClassifier';
import { DEFAULT_SURFACE_COLOR } from '../../colors';
import { logError } from '../../utils/errorReporter';

// Module-scope cache: survives component unmount/remount cycles
const surfaceCache = new Map<string, SurfaceData>();
const MAX_CACHE_SIZE = 10;

export interface SurfaceProps {
  molecule: Molecule;
  type?: 'vdw' | 'sas';
  opacity?: number;
  color?: string;
  colorScheme?: ColorScheme;
  wireframe?: boolean;
  probeRadius?: number;
  resolution?: number;
  visible?: boolean;
  /** Visible components other than water and ions get the surface (surfaceAtoms). */
  componentSettings?: ComponentSettings[];
}

export function Surface({
  molecule,
  type = 'vdw',
  opacity = 0.7,
  color = DEFAULT_SURFACE_COLOR,
  colorScheme,
  wireframe = false,
  probeRadius = 1.4,
  resolution = 1.0, // High quality: 1Å grid spacing
  visible = true,
  componentSettings,
}: SurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // The atoms to surface. componentSettings is a new array on every style
  // change; the subset only changes with the visible component types (its
  // key), so the mesh isn't rebuilt when a component is restyled.
  const subset = useMemo(() => surfaceAtoms(molecule, componentSettings), [molecule, componentSettings]);
  const subsetKey = subset.key;

  // Generate stable molecule hash for cache key
  const moleculeHash = useMemo(() => {
    // Use atom count + first/last atom positions as fingerprint
    if (molecule.atoms.length === 0) return 'empty';
    const first = molecule.atoms[0];
    const last = molecule.atoms[molecule.atoms.length - 1];
    return `${molecule.atoms.length}-${first.x.toFixed(2)},${first.y.toFixed(2)},${first.z.toFixed(2)}-${last.x.toFixed(2)},${last.y.toFixed(2)},${last.z.toFixed(2)}`;
  }, [molecule.atoms]);

  // Generate cache key with normalized floating-point parameters
  const cacheKey = useMemo(
    () => `${moleculeHash}-${subsetKey}-${type}-${probeRadius.toFixed(2)}-${resolution.toFixed(2)}`,
    [moleculeHash, subsetKey, type, probeRadius, resolution]
  );

  // Calculate color context for color schemes that need it
  const colorContext = useMemo(
    () => colorScheme ? calculateColorSchemeContext(molecule) : undefined,
    [molecule, colorScheme]
  );

  const { geometry, useVertexColors } = useMemo(() => {
    // Nothing to surface: every component hidden, or an empty molecule
    if (!subset.atoms.length) return { geometry: null, useVertexColors: false };

    // Check module-scope cache first (survives unmount/remount)
    const cached = surfaceCache.get(cacheKey);

    let surfaceData: SurfaceData;

    if (cached) {
      surfaceData = cached;
    } else {

      const options: SurfaceOptions = {
        type,
        probeRadius: type === 'sas' ? probeRadius : 0,
        resolution,
      };

      try {
        surfaceData = generateSurface(subset.atoms, options);

        // Store in cache
        surfaceCache.set(cacheKey, surfaceData);

        // Enforce cache size limit (LRU eviction)
        if (surfaceCache.size > MAX_CACHE_SIZE) {
          const firstKey = surfaceCache.keys().next().value;
          if (firstKey !== undefined) surfaceCache.delete(firstKey);
        }
      } catch (error) {
        console.error('Failed to generate surface:', error);
        logError(error instanceof Error ? error : new Error(String(error)), { source: 'Surface.generate' });
        return { geometry: null, useVertexColors: false };
      }
    }

    try {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        'position',
        new THREE.BufferAttribute(surfaceData.vertices, 3)
      );
      geom.setAttribute(
        'normal',
        new THREE.BufferAttribute(surfaceData.normals, 3)
      );
      geom.setIndex(new THREE.BufferAttribute(surfaceData.indices, 1));

      // Add per-vertex colors if colorScheme is specified: each vertex takes
      // its nearest atom's colour, with ranges from the whole molecule
      if (colorScheme) {
        const colors = surfaceVertexColors(surfaceData.nearestAtomIndices, subset, molecule, colorScheme, colorContext);
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return { geometry: geom, useVertexColors: true };
      }

      return { geometry: geom, useVertexColors: false };
    } catch (error) {
      console.error('Failed to create Three.js geometry from surface data:', error);
      logError(error instanceof Error ? error : new Error(String(error)), { source: 'Surface.geometry' });
      return { geometry: null, useVertexColors: false };
    }
    // subset is read through cacheKey (its key): same key, same atoms
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [molecule, type, probeRadius, resolution, colorScheme, colorContext, cacheKey]);

  // Dispose previous geometry when it changes or on unmount
  const prevGeomRef = useRef<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    if (prevGeomRef.current && prevGeomRef.current !== geometry) {
      prevGeomRef.current.dispose();
    }
    prevGeomRef.current = geometry;
    return () => { prevGeomRef.current?.dispose(); };
  }, [geometry]);

  if (!geometry || !visible) return null;

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshPhongMaterial
        color={useVertexColors ? 0xffffff : color}
        vertexColors={useVertexColors}
        transparent={opacity < 1}
        opacity={opacity}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        depthWrite={opacity >= 1}
      />
    </mesh>
  );
}
