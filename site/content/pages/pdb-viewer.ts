import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/pdb-viewer',
  kind: 'tool',
  updated: '2026-11-02',
  title: 'PDB File Viewer Online: Open .pdb Files in 3D | MolViewer',
  description:
    'Open a .pdb file or any PDB ID in 3D, free in your browser with no install. Cartoon, surfaces, B-factor colors, measurements and share links.',
  h1: 'Online PDB file viewer',
  intro:
    '<p>MolViewer opens your <code>.pdb</code> files in 3D, free in the browser. Drag a file onto the drop zone in the <a href="/">viewer</a> and the structure appears in seconds. The file is parsed on your own device, not uploaded. To try it, <a href="/sample-molecules/1crn.pdb" download>download a sample PDB file</a> (crambin, 327 atoms). For a published structure, type a four-character PDB ID such as <a href="/pdb/4HHB">4HHB</a> instead. There is nothing to install and no account to create.</p>',
  sections: [
    {
      heading: 'About the PDB file format',
      html:
        '<p>A PDB file is plain text with fixed-width lines of 80 columns. The first six characters name the record type. <code>HEADER</code> and <code>COMPND</code> say what the molecule is. <code>ATOM</code> lines hold the standard protein and nucleic acid residues, one atom per line: atom name, residue, chain, x, y and z in ångströms, occupancy and B-factor. <code>HETATM</code> lines do the same for everything else, such as ligands, metal ions and water. <code>HELIX</code> and <code>SHEET</code> list secondary structure, <code>CONECT</code> lists explicit bonds, and <code>MODEL</code> and <code>ENDMDL</code> separate the models of an NMR ensemble.</p>' +
        '<p>Fixed columns set hard limits: 99,999 atoms and 62 chains per file. Large assemblies do not fit, so in 2014 the worldwide PDB made PDBx/<a href="/mmcif-viewer">mmCIF</a> its standard archive format. Docking programs, modelling tools and older datasets still write <code>.pdb</code> files.</p>' +
        '<p>MolViewer reads ATOM and HETATM records for coordinates, HELIX and SHEET records for secondary structure, and CONECT records for explicit bonds. When a file has no CONECT records, bonds are inferred from the distances between atoms. The structure takes its name from the HEADER or COMPND record. For a file with several models, only the first model is shown. For a field-by-field walkthrough with real examples, read <a href="/learn/how-to-read-a-pdb-file">how to read a PDB file</a>.</p>',
    },
    {
      heading: 'Open a PDB file or a PDB ID',
      html:
        '<p>For your own file, open the <a href="/">viewer</a> and drop the <code>.pdb</code> file on the drop zone, or click the zone to choose it. Files can be up to 5 MB. Besides PDB, MolViewer reads <a href="/mmcif-viewer">mmCIF</a>, <a href="/sdf-viewer">SDF and MOL</a> and <a href="/xyz-viewer">XYZ</a> files.</p>' +
        '<p>For a published structure, type its PDB ID in the "Fetch from RCSB" box, or go straight to a URL such as <a href="/pdb/1UBQ">molviewer.bio/pdb/1UBQ</a> (ubiquitin). Entries fetched by ID come from RCSB in mmCIF, so structures too large for a <code>.pdb</code> file open the same way.</p>',
    },
    {
      heading: 'View a PDB file as cartoon, sticks or surface',
      html:
        '<p>When a PDB file opens, MolViewer sorts its residues into protein, nucleic acid, ligand, ion and water, and gives each a sensible default:</p>' +
        '<ul>' +
        '<li><strong>Cartoon</strong> for protein chains, drawn from the HELIX and SHEET records: helices as spiral ribbons, strands as arrows. If a file has no such records, MolViewer estimates them from backbone angles. Try crambin in <a href="/pdb/1CRN?repr=cartoon&amp;color=secondaryStructure">cartoon with secondary-structure colors</a>.</li>' +
        '<li><strong>Ball-and-stick</strong> for ligands and cofactors stored as HETATM records, such as the four heme groups of <a href="/pdb/4HHB">hemoglobin</a>. Water (<code>HOH</code>) is hidden by default, because a crystal structure can hold hundreds of water molecules.</li>' +
        '<li><strong>Stick, spacefill and molecular surfaces</strong> (van der Waals or solvent-accessible, with adjustable opacity) are one click away.</li>' +
        '</ul>' +
        '<p>Colors can follow the file too. B-factor coloring reads columns 61 to 66 of each atom line, so flexible loops and chain ends stand out: see <a href="/pdb/1CRN?repr=cartoon&amp;color=bfactor">crambin colored by B-factor</a>. Chain coloring uses the chain identifier in column 22. Element (CPK), residue type and rainbow from N- to C-terminus are also available.</p>',
    },
    {
      heading: 'Measure distances and read the sequence',
      html:
        '<p>Click atoms to measure distances in ångströms, bond angles and dihedral angles. Hover an atom to see what its ATOM or HETATM line says: atom name, residue, chain, occupancy and B-factor. Right-click an atom to focus the camera on it, start a measurement, add a 3D label, or select its residue or chain.</p>' +
        '<p>The sequence viewer lists each chain in one-letter codes with a secondary-structure bar. Click a residue to highlight it in 3D.</p>',
    },
    {
      heading: 'Compare, save and share structures',
      html:
        '<p>Load up to 10 structures, for example several models of the same protein, and show them overlaid or side by side, each with its own style and colors. Overlay keeps every file in its own coordinates. MolViewer does not superpose structures for you, so models that share a coordinate frame line up and unrelated entries do not.</p>' +
        '<p>Export PNG images at up to 4x resolution with an optional transparent background, save sessions in your browser, or create a short share link that restores the structures, camera, measurements and labels. To put a live viewer on a course page, embed it with an <code>&lt;iframe&gt;</code> that points at a URL such as <code>/embed/pdb/4HHB</code>.</p>',
    },
  ],
  faq: [
    {
      q: 'How do I open a PDB file without installing software?',
      a: 'Open molviewer.bio in any modern browser and drag the .pdb file onto the drop zone, or click the zone to choose the file. The structure appears in 3D. Nothing is installed, and the file is read on your own device.',
    },
    {
      q: 'What is the difference between PDB and mmCIF?',
      a: 'Both describe the same atoms. PDB is the older fixed-column text format, limited to 99,999 atoms and 62 chains. PDBx/mmCIF labels every value by name, has no such limits, and has been the archive standard of the worldwide PDB since 2014. MolViewer opens both.',
    },
    {
      q: 'Is this PDB file viewer free?',
      a: 'Yes. MolViewer is free and open source under the MIT license. It runs in any modern browser with WebGL 2, on desktop or mobile, with no install and no account.',
    },
    {
      q: 'Are my PDB files uploaded to a server?',
      a: 'No. Files you open from your computer are read and rendered in your browser. The only exception is when you choose to create a share link for a scene that contains a small local file; that file is then stored with the link so other people can open it.',
    },
    {
      q: 'Can it handle very large structures?',
      a: 'Local files can be up to 5 MB. Entries fetched by PDB ID come as mmCIF, so the old PDB limits of 99,999 atoms and 62 chains do not apply to them. Very large assemblies can still be slow on older phones and laptops. For whole viruses, cryo-EM maps or simulation trajectories, a specialist tool such as Mol* is a better fit.',
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
