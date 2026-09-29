import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/xyz-viewer',
  kind: 'tool',
  updated: '2026-09-28',
  title: 'XYZ File Viewer Online: Coordinates in 3D | MolViewer',
  description:
    'Open XYZ coordinate files from quantum chemistry and simulation in 3D, free in your browser with no install. Bonds are inferred, then measure and share.',
  h1: 'Online XYZ file viewer',
  intro:
    '<p>XYZ is the simplest molecular file format: a list of elements and Cartesian coordinates. Quantum chemistry packages such as ORCA, Gaussian, xTB and CP2K, and many machine-learning datasets, write it. MolViewer opens <code>.xyz</code> files in 3D, draws the bonds for you and lets you measure geometry, free in your browser with no install.</p>',
  sections: [
    {
      heading: 'How the XYZ format works',
      html:
        '<p>An XYZ file has a two-line header followed by one line per atom:</p>' +
        '<ol>' +
        '<li>The number of atoms.</li>' +
        '<li>A comment line, often the molecule name or an energy. MolViewer uses it as the title.</li>' +
        '<li>One line per atom: element symbol, then x, y and z in ångströms, separated by spaces.</li>' +
        '</ol>' +
        '<p>For water, the atom lines might read <code>O 0.000 0.000 0.117</code>, <code>H 0.000 0.757 -0.469</code> and <code>H 0.000 -0.757 -0.469</code>. There is no connectivity, no residues and no chains: just atoms in space.</p>',
    },
    {
      heading: 'Bonds from distances',
      html:
        '<p>Because XYZ files contain no bonds, MolViewer infers them. Two atoms are bonded when their distance is close to the sum of their covalent radii, within a small tolerance. This works well for ordinary organic and inorganic molecules. Unusual geometries, such as stretched bonds in a transition state or metal coordination, may gain or lose a bond compared with what you expect, so always check the numbers with the measurement tools.</p>' +
        '<p>Bond orders cannot be recovered from coordinates alone, so every inferred bond is drawn the same way. If you need explicit single and double bonds, save the structure as <a href="/sdf-viewer">SDF or MOL</a> instead.</p>',
    },
    {
      heading: 'Checking a geometry',
      html:
        '<p>After an optimization, open the output geometry and click atoms to read bond lengths in ångströms, bond angles and dihedral angles. Label key atoms, export a PNG for your report or slides, and share the scene with a short link. You can load up to 10 structures, for example a reactant and a product, in side-by-side layout to compare them.</p>' +
        '<p>For a quick example of the kind of molecule XYZ files usually hold, open <a href="/compound/caffeine">caffeine</a> in ball-and-stick and measure a C-N bond.</p>',
    },
  ],
  faq: [
    {
      q: 'Can MolViewer play a multi-frame XYZ trajectory?',
      a: 'No. If a file contains several frames, such as an optimization path or a molecular dynamics run, MolViewer shows the first frame only. Trajectory playback is not supported.',
    },
    {
      q: 'Does it read extended XYZ files?',
      a: 'Partly. MolViewer reads the element and the first three numbers on each atom line, so extra per-atom columns are ignored. Lattice and property information in the comment line is not used.',
    },
    {
      q: 'Why is a bond missing or extra?',
      a: 'Bonds in an XYZ file are guessed from interatomic distances and covalent radii. Very long, very short or metal-ligand bonds can fall outside the tolerance. Measure the distance directly to see the actual value.',
    },
    {
      q: 'Is my file uploaded?',
      a: 'No. The file is read in your browser and stays on your device unless you choose to create a share link that includes it.',
    },
  ],
  cta: { label: 'Open caffeine in ball-and-stick', href: '/compound/caffeine' },
  related: [
    { label: 'SDF and MOL file viewer', href: '/sdf-viewer' },
    { label: 'Small molecule index', href: '/compounds' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'Free PyMOL alternative', href: '/pymol-online-alternative' },
  ],
};
