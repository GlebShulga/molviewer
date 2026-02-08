import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { Molecule } from '../../types';
import type { ColorScheme } from '../../store/moleculeStore';
import { generateSurface, type SurfaceOptions, type SurfaceData } from '../../utils/surfaceGeneration';
import { getAtomColor, calculateColorSchemeContext } from '../../utils/atomColor';
import { DEFAULT_SURFACE_COLOR } from '../../colors';
import { logError } from '../../utils/errorReporter';

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
}

/**
 * Parse a CSS color string to RGB values (0-1 range)
 */
function parseColor(colorStr: string): [number, number, number] {
  // Handle hex colors
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b];
  }

  // Handle rgb() colors
  if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/\d+/g);
    if (match && match.length >= 3) {
      return [
        parseInt(match[0]) / 255,
        parseInt(match[1]) / 255,
        parseInt(match[2]) / 255,
      ];
    }
  }

  // Handle hsl() colors
  if (colorStr.startsWith('hsl')) {
    const match = colorStr.match(/[\d.]+/g);
    if (match && match.length >= 3) {
      const h = parseFloat(match[0]) / 360;
      const s = parseFloat(match[1]) / 100;
      const l = parseFloat(match[2]) / 100;
      // HSL to RGB conversion
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return [
        hue2rgb(p, q, h + 1/3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1/3),
      ];
    }
  }

  // Default fallback
  return [0.5, 0.5, 0.5];
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
}: SurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const cacheRef = useRef<Map<string, SurfaceData>>(new Map());

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
    () => `${moleculeHash}-${type}-${probeRadius.toFixed(2)}-${resolution.toFixed(2)}`,
    [moleculeHash, type, probeRadius, resolution]
  );

  // Calculate color context for color schemes that need it
  const colorContext = useMemo(
    () => colorScheme ? calculateColorSchemeContext(molecule) : undefined,
    [molecule, colorScheme]
  );

  const { geometry, useVertexColors } = useMemo(() => {
    if (!molecule.atoms.length) return { geometry: null, useVertexColors: false };

    // Check cache first
    const cached = cacheRef.current.get(cacheKey);

    let surfaceData: SurfaceData;
    const MAX_CACHE_SIZE = 10; // Keep max 10 surfaces

    if (cached) {
      surfaceData = cached;
    } else {

      const options: SurfaceOptions = {
        type,
        probeRadius: type === 'sas' ? probeRadius : 0,
        resolution,
      };

      try {
        surfaceData = generateSurface(molecule.atoms, options);

        // Store in cache
        cacheRef.current.set(cacheKey, surfaceData);

        // Enforce cache size limit (LRU eviction)
        if (cacheRef.current.size >= MAX_CACHE_SIZE) {
          const firstKey = Array.from(cacheRef.current.keys())[0];
          cacheRef.current.delete(firstKey);
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

      // Add per-vertex colors if colorScheme is specified
      if (colorScheme) {
        const vertexCount = surfaceData.vertices.length / 3;
        const colors = new Float32Array(vertexCount * 3);

        for (let i = 0; i < vertexCount; i++) {
          // Use precomputed nearest atom index from surface generation
          const nearestAtomIndex = surfaceData.nearestAtomIndices[i];
          const nearestAtom = molecule.atoms[nearestAtomIndex];

          // Get color for this atom
          const atomColor = getAtomColor(nearestAtom, colorScheme, colorContext);
          const [r, g, b] = parseColor(atomColor);

          colors[i * 3] = r;
          colors[i * 3 + 1] = g;
          colors[i * 3 + 2] = b;
        }

        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return { geometry: geom, useVertexColors: true };
      }

      return { geometry: geom, useVertexColors: false };
    } catch (error) {
      console.error('Failed to create Three.js geometry from surface data:', error);
      logError(error instanceof Error ? error : new Error(String(error)), { source: 'Surface.geometry' });
      return { geometry: null, useVertexColors: false };
    }
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
