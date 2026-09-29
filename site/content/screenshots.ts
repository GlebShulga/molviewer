/**
 * Screenshots shown on the tool pages, captured from the running app by
 * scripts/capture-screenshots.ts into public/screenshots/.
 */
import type { ContentPage } from './types';

export const SCREENSHOTS: Record<string, NonNullable<ContentPage['screenshot']>> = {
  '/pdb-viewer': { src: '/screenshots/pdb-viewer.jpg', alt: "Hemoglobin (PDB 4HHB) as a cartoon colored by chain in the MolViewer online PDB viewer", width: 1280, height: 720 },
  '/alphafold-viewer': { src: '/screenshots/alphafold-viewer.jpg', alt: "AlphaFold model of p53 (P04637) colored by pLDDT confidence", width: 1280, height: 720 },
  '/mmcif-viewer': { src: '/screenshots/mmcif-viewer.jpg', alt: "SARS-CoV-2 spike glycoprotein (6VXX) loaded from mmCIF, colored by chain", width: 1280, height: 720 },
  '/sdf-viewer': { src: '/screenshots/sdf-viewer.jpg', alt: "Aspirin opened from an SDF file, shown as ball-and-stick", width: 1280, height: 720 },
  '/xyz-viewer': { src: '/screenshots/xyz-viewer.jpg', alt: "Caffeine in 3D with CPK colors", width: 1280, height: 720 },
  '/pymol-online-alternative': { src: '/screenshots/pymol-online-alternative.jpg', alt: "HIV-1 protease with a bound inhibitor (1HSG), cartoon colored by secondary structure", width: 1280, height: 720 },
  '/compare': { src: '/screenshots/compare.jpg', alt: "SARS-CoV-2 main protease (6LU7) in rainbow coloring", width: 1280, height: 720 },
};
