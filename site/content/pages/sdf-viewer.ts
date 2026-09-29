import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/sdf-viewer',
  kind: 'tool',
  updated: '2026-09-28',
  title: 'SDF and MOL File Viewer Online in 3D | MolViewer',
  description:
    'View SDF and MOL files as interactive 3D models, free in your browser with no install. Rotate, measure bond lengths and angles, and export images.',
  h1: 'Online SDF and MOL file viewer',
  intro:
    '<p>MolViewer turns SDF and MOL files into interactive 3D models. Drag a file onto the viewer and rotate, zoom and measure the molecule in seconds. It is free, needs no install and keeps your files on your own device. You can also look up small molecules by name, for example <a href="/compound/caffeine">caffeine</a> or <a href="/compound/aspirin">aspirin</a>.</p>',
  sections: [
    {
      heading: 'About SDF and MOL files',
      html:
        '<p>A MOL file (MDL molfile) describes one molecule: a header, a counts line, an atom block with x, y and z coordinates and element symbols, and a bond block listing which atoms are connected and by what bond order. An SDF (structure-data file) wraps one or more molfiles, each followed by optional data fields and a <code>$$$$</code> separator. PubChem, ChEMBL, ZINC and most cheminformatics tools export these formats.</p>' +
        '<p>MolViewer reads the V2000 molfile layout, which is by far the most common. For an SDF with several records it shows the first molecule. The newer V3000 layout is not supported yet.</p>',
    },
    {
      heading: 'What you can do with a small molecule',
      html:
        '<ul>' +
        '<li><strong>Switch styles</strong> between ball-and-stick, stick and spacefill, or wrap the molecule in a van der Waals or solvent-accessible surface.</li>' +
        '<li><strong>Measure geometry</strong>: click atoms to get bond lengths in ångströms, bond angles and torsion (dihedral) angles.</li>' +
        '<li><strong>Read the chemistry</strong>: the metadata panel counts atoms by element and bonds by order, and aromatic rings are detected and drawn.</li>' +
        '<li><strong>Label and share</strong>: add 3D labels, export a PNG at up to 4x resolution with a transparent background, or create a short share link.</li>' +
        '</ul>' +
        '<p>Small molecules look best in CPK (element) colors: carbon grey, oxygen red, nitrogen blue. Try <a href="/compound/aspirin">aspirin</a> and measure the angle at the ester oxygen, or browse the <a href="/compounds">compound index</a> for more examples.</p>',
    },
    {
      heading: 'Ligands in context',
      html:
        '<p>Many ligands are easier to understand next to their protein. MolViewer can hold up to 10 structures at once, so you can open a ligand SDF alongside a protein entry such as hemoglobin <a href="/pdb/4HHB">4HHB</a>, whose heme groups are stored as HETATM records. Docked poses that share the protein coordinate frame line up in overlay mode, because each file keeps its original coordinates. MolViewer displays poses; it does not perform docking.</p>',
    },
  ],
  faq: [
    {
      q: 'What is the difference between SDF and MOL?',
      a: 'A MOL file holds a single molecule. An SDF file can hold many molecules, each a MOL block followed by optional data fields and a line containing four dollar signs. MolViewer opens both and shows the first molecule in an SDF.',
    },
    {
      q: 'My SDF only has 2D coordinates. Will it work?',
      a: 'It will open, but a 2D file has all z coordinates set to zero, so the molecule appears flat. Generate 3D coordinates first, or look the compound up by name, which loads a 3D structure from PubChem.',
    },
    {
      q: 'Are hydrogens shown?',
      a: 'Yes, if they are in the file. MolViewer draws the atoms the file contains and does not add or remove hydrogens.',
    },
    {
      q: 'Can I edit or draw a molecule?',
      a: 'No. MolViewer is a viewer. To sketch a structure from scratch, use a drawing tool such as MolView or a desktop editor, save it as MOL or SDF, then open it here.',
    },
  ],
  cta: { label: 'Open caffeine in 3D', href: '/compound/caffeine' },
  related: [
    { label: 'Small molecule index', href: '/compounds' },
    { label: 'XYZ file viewer', href: '/xyz-viewer' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'Enzymes and their ligands', href: '/collections/enzymes' },
    { label: 'Compare web molecule viewers', href: '/compare' },
  ],
};
