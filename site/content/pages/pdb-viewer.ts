import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/pdb-viewer',
  kind: 'tool',
  updated: '2026-09-28',
  title: 'PDB File Viewer Online: Free 3D Protein Viewer | MolViewer',
  description:
    'Open any PDB file or RCSB entry in 3D, free in your browser with no install. Cartoon, surfaces, measurements, a sequence viewer and share links.',
  h1: 'Online PDB viewer',
  intro:
    '<p>MolViewer is a free PDB file viewer that runs in your browser. Type a four-character PDB ID such as <a href="/pdb/4HHB">4HHB</a> to fetch the entry from the RCSB Protein Data Bank, or drop a <code>.pdb</code> file from your computer onto the page. There is nothing to install and no account to create.</p>',
  sections: [
    {
      heading: 'Open a structure in seconds',
      html:
        '<p>For published structures, enter the PDB ID in the RCSB box, or go straight to a URL such as <a href="/pdb/1UBQ">molviewer.bio/pdb/1UBQ</a> (ubiquitin). MolViewer downloads the entry in mmCIF, the standard format of the PDB archive, which also covers entries too large for legacy PDB files.</p>' +
        '<p>For your own models, drag a file onto the viewer or use the file picker. Besides PDB, MolViewer reads <a href="/mmcif-viewer">mmCIF</a>, <a href="/sdf-viewer">SDF and MOL</a> and <a href="/xyz-viewer">XYZ</a> files. Local files are parsed on your device and are not uploaded anywhere.</p>',
    },
    {
      heading: 'Ways to look at a protein',
      html:
        '<ul>' +
        '<li><strong>Cartoon</strong> ribbons trace the backbone and show helices and sheets. Try crambin in <a href="/pdb/1CRN?repr=cartoon&amp;color=secondaryStructure">cartoon with secondary-structure colors</a>.</li>' +
        '<li><strong>Ball-and-stick, stick and spacefill</strong> show individual atoms and bonds, which suits ligands, active sites and small molecules.</li>' +
        '<li><strong>Molecular surfaces</strong> (van der Waals or solvent-accessible) with adjustable opacity show the shape a protein presents to its surroundings.</li>' +
        '<li><strong>Color schemes</strong>: element (CPK), chain, residue type, B-factor, rainbow from N- to C-terminus, and secondary structure.</li>' +
        '</ul>' +
        '<p>Helix and sheet assignments come from the HELIX and SHEET records in the file. If a file has none, MolViewer estimates them from backbone angles so the cartoon still makes sense.</p>',
    },
    {
      heading: 'Measure, label and follow the sequence',
      html:
        '<p>Click atoms to measure distances in ångströms, bond angles and dihedral angles. Right-click an atom to focus the camera on it, start a measurement, add a 3D label, or select its residue or chain. Hovering an atom shows its name, residue, chain, occupancy and B-factor.</p>' +
        '<p>The sequence viewer lists each chain with one-letter residue codes and a secondary-structure bar. Click a residue to highlight it in 3D. If you are new to the format itself, read <a href="/learn/how-to-read-a-pdb-file">how to read a PDB file</a>.</p>',
    },
    {
      heading: 'Compare, save and share',
      html:
        '<p>Load up to 10 structures and show them overlaid or side by side, each with its own representation and colors. Overlay keeps each file in its deposited coordinates; MolViewer does not superpose structures for you.</p>' +
        '<p>Undo and redo cover view changes. Export PNG images at 1x, 2x or 4x with an optional transparent background, save sessions in your browser, or create a short share link that restores the structures, camera, measurements and labels. To put a live viewer on a course page, embed it with an <code>&lt;iframe&gt;</code> that points at a URL such as <code>/embed/pdb/4HHB</code>.</p>',
    },
  ],
  faq: [
    {
      q: 'Is this PDB viewer really free?',
      a: 'Yes. MolViewer is free and open source under the MIT license. It runs in any modern browser with WebGL 2, on desktop or mobile, with no install and no account.',
    },
    {
      q: 'Are my PDB files uploaded to a server?',
      a: 'No. Files you open from your computer are read and rendered in your browser. The only exception is when you choose to create a share link for a scene that contains a small local file; that file is then stored with the link so other people can open it.',
    },
    {
      q: 'Which parts of a PDB file does MolViewer use?',
      a: 'ATOM and HETATM records for coordinates, HELIX and SHEET records for secondary structure, and CONECT records for explicit bonds. When a file has no CONECT records, bonds are inferred from interatomic distances. For NMR entries with several models, only the first model is shown.',
    },
    {
      q: 'Can it handle very large structures?',
      a: 'Entries fetched by PDB ID come as mmCIF, so the old PDB limits of 99,999 atoms and 62 chains do not apply. Very large assemblies can still be slow on older phones and laptops. For whole viruses, cryo-EM maps or simulation trajectories, a specialist tool such as Mol* is a better fit.',
    },
  ],
  cta: { label: 'Open hemoglobin (4HHB) in the viewer', href: '/pdb/4HHB' },
  related: [
    { label: 'mmCIF / CIF file viewer', href: '/mmcif-viewer' },
    { label: 'AlphaFold structure viewer', href: '/alphafold-viewer' },
    { label: 'How to read a PDB file', href: '/learn/how-to-read-a-pdb-file' },
    { label: 'Hemoglobin and oxygen transport', href: '/collections/hemoglobin-oxygen-transport' },
    { label: 'Compare web molecule viewers', href: '/compare' },
  ],
};
