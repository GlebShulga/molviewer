import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test molecule fixtures
 */
export const molecules = {
  caffeine: path.join(__dirname, 'molecules', 'caffeine.pdb'),
  aspirin: path.join(__dirname, 'molecules', 'aspirin.sdf'),
  water: path.join(__dirname, 'molecules', 'water.xyz'),
  invalid: path.join(__dirname, 'molecules', 'invalid.pdb'),
  crambin: path.join(__dirname, 'molecules', '1crn.pdb'), // 327 atoms, for large molecule tests
  crambinCif: path.join(__dirname, 'molecules', '1crn.cif'), // 327 atoms, mmCIF format
} as const;

/**
 * RCSB PDB IDs for fetch tests
 */
export const rcsbIds = {
  valid: '1CRN', // Crambin - small protein, fast to load
  insulin: '2INS', // Insulin - small protein for multi-structure tests
  invalid: 'XXXX', // Invalid ID for error testing
  complexAssembly: '1B7G', // Multi-assembly structure (2 assemblies, 3 transforms) - for stress testing
} as const;

/**
 * Sample molecule button names (must match UI)
 */
export const sampleMolecules = {
  caffeine: 'Caffeine',
  aspirin: 'Aspirin',
  water: 'Water',
} as const;

/**
 * Multi-structure test scenarios
 */
export const multiStructureScenarios = {
  // Two proteins for multi-structure testing
  twoProteins: [
    path.join(__dirname, 'molecules', '1crn.pdb'),
    path.join(__dirname, 'molecules', 'caffeine.pdb'),
  ],
  // Protein and small molecule
  proteinAndLigand: [
    path.join(__dirname, 'molecules', '1crn.pdb'),
    path.join(__dirname, 'molecules', 'caffeine.pdb'),
  ],
  // Multiple small molecules
  smallMolecules: [
    path.join(__dirname, 'molecules', 'caffeine.pdb'),
    path.join(__dirname, 'molecules', 'water.xyz'),
  ],
} as const;

/**
 * Viewport presets for responsive testing
 */
export const viewports = {
  mobile: { width: 375, height: 667 },    // iPhone SE
  mobileL: { width: 414, height: 896 },   // iPhone 11 Pro Max
  tablet: { width: 768, height: 1024 },   // iPad
  desktop: { width: 1280, height: 720 },  // Standard desktop
  desktopL: { width: 1920, height: 1080 }, // Large desktop
} as const;
