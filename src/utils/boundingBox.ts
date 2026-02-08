import type { Molecule } from '../types';
import type { Structure } from '../types/multiStructure';

export interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  radius: number;
}

/**
 * Calculate the bounding box of a molecule
 */
export function calculateBoundingBox(molecule: Molecule): BoundingBox {
  if (molecule.atoms.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
      radius: 0,
    };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const atom of molecule.atoms) {
    minX = Math.min(minX, atom.x);
    minY = Math.min(minY, atom.y);
    minZ = Math.min(minZ, atom.z);
    maxX = Math.max(maxX, atom.x);
    maxY = Math.max(maxY, atom.y);
    maxZ = Math.max(maxZ, atom.z);
  }

  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };

  const size = {
    x: maxX - minX,
    y: maxY - minY,
    z: maxZ - minZ,
  };

  // Radius is the distance from center to the farthest corner
  const radius = Math.sqrt(
    (size.x / 2) ** 2 + (size.y / 2) ** 2 + (size.z / 2) ** 2
  );

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center,
    size,
    radius,
  };
}

/**
 * Calculate bounding box for a structure, applying its offset
 */
export function calculateStructureBoundingBox(structure: Structure): BoundingBox {
  const box = calculateBoundingBox(structure.molecule);
  const [offsetX, offsetY, offsetZ] = structure.offset;

  return {
    min: {
      x: box.min.x + offsetX,
      y: box.min.y + offsetY,
      z: box.min.z + offsetZ,
    },
    max: {
      x: box.max.x + offsetX,
      y: box.max.y + offsetY,
      z: box.max.z + offsetZ,
    },
    center: {
      x: box.center.x + offsetX,
      y: box.center.y + offsetY,
      z: box.center.z + offsetZ,
    },
    size: box.size,
    radius: box.radius,
  };
}

/**
 * Combine multiple bounding boxes into one that encompasses all
 */
export function combineBoundingBoxes(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
      radius: 0,
    };
  }

  if (boxes.length === 1) {
    return boxes[0];
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.min.x);
    minY = Math.min(minY, box.min.y);
    minZ = Math.min(minZ, box.min.z);
    maxX = Math.max(maxX, box.max.x);
    maxY = Math.max(maxY, box.max.y);
    maxZ = Math.max(maxZ, box.max.z);
  }

  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };

  const size = {
    x: maxX - minX,
    y: maxY - minY,
    z: maxZ - minZ,
  };

  const radius = Math.sqrt(
    (size.x / 2) ** 2 + (size.y / 2) ** 2 + (size.z / 2) ** 2
  );

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center,
    size,
    radius,
  };
}

/**
 * Calculate the camera distance needed to fit a bounding box in view
 * @param box The bounding box to fit
 * @param fov Field of view in degrees
 * @param padding Padding factor (1.0 = exact fit, 1.2 = 20% padding)
 */
export function calculateCameraDistance(
  box: BoundingBox,
  fov: number = 50,
  padding: number = 1.2
): number {
  // Convert FOV to radians
  const fovRad = (fov * Math.PI) / 180;

  // Calculate the distance needed to fit the bounding sphere
  // Using vertical FOV for consistency
  const distance = (box.radius * padding) / Math.tan(fovRad / 2);

  // Ensure minimum distance for very small molecules
  return Math.max(distance, 10);
}

/**
 * Calculate combined bounding box for all visible structures
 */
export function calculateAllStructuresBoundingBox(
  structures: Map<string, Structure>,
  structureOrder: string[]
): BoundingBox {
  const visibleBoxes: BoundingBox[] = [];

  for (const id of structureOrder) {
    const structure = structures.get(id);
    if (structure && structure.visible) {
      visibleBoxes.push(calculateStructureBoundingBox(structure));
    }
  }

  return combineBoundingBoxes(visibleBoxes);
}
