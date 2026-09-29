import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/mmcif-viewer',
  kind: 'tool',
  updated: '2026-09-28',
  title: 'mmCIF / CIF File Viewer Online, Free in 3D | MolViewer',
  description:
    'Open mmCIF and PDBx/CIF files in 3D, free in your browser with no install. Drag in .cif or .cif.gz files, or load any PDB ID, then measure and share.',
  h1: 'Online mmCIF and CIF file viewer',
  intro:
    '<p>MolViewer reads macromolecular CIF files (PDBx/mmCIF), the format the Protein Data Bank uses for its archive. Drag a <code>.cif</code>, <code>.mmcif</code> or gzip-compressed <code>.cif.gz</code> file onto the viewer, or type a PDB ID and MolViewer fetches the mmCIF from RCSB for you. It is free, runs in your browser and needs no install.</p>',
  sections: [
    {
      heading: 'Why mmCIF',
      html:
        '<p>The legacy PDB format stores each atom on a fixed-width 80-column line. That design caps a file at 99,999 atoms and 62 chains, far too small for ribosomes, viral capsids and many cryo-EM structures. PDBx/mmCIF replaces fixed columns with named data items such as <code>_atom_site.Cartn_x</code>, so there is no practical limit on size. It became the standard archive format of the worldwide PDB (wwPDB) in 2014, and structures too large for the old format are distributed only as mmCIF.</p>' +
        '<p>Because MolViewer always downloads mmCIF from RCSB, large entries such as the SARS-CoV-2 spike <a href="/pdb/6VXX">6VXX</a> open by ID, with no conversion step.</p>',
    },
    {
      heading: 'What MolViewer reads from the file',
      html:
        '<ul>' +
        '<li><strong>Coordinates</strong> from the <code>_atom_site</code> loop, including element, residue, chain and B-factor.</li>' +
        '<li><strong>Helices and sheets</strong> from <code>_struct_conf</code> and <code>_struct_sheet_range</code>, used by the cartoon and by the <a href="/pdb/1CRN?repr=cartoon&amp;color=secondaryStructure">secondary-structure color scheme</a>.</li>' +
        '<li><strong>The first model</strong> of multi-model entries such as NMR ensembles.</li>' +
        '<li><strong>One conformer</strong>: where atoms have alternate locations, the first (A) is kept.</li>' +
        '</ul>' +
        '<p>Once loaded, you get the full toolset: cartoon, ball-and-stick, spacefill and surfaces; six color schemes; distance, angle and dihedral measurements; a clickable sequence viewer; PNG export and share links. AlphaFold models are also distributed as mmCIF, so the same viewer opens <a href="/af/P04637">predicted structures</a> too.</p>',
    },
    {
      heading: 'Macromolecular CIF versus small-molecule CIF',
      html:
        '<p>The CIF name covers two dialects. Crystallographic databases for small molecules and minerals publish core CIF files that give atoms as fractional coordinates within a unit cell. MolViewer does not read these: it needs the Cartesian coordinates of PDBx/mmCIF. For a small organic molecule, open an <a href="/sdf-viewer">SDF or MOL file</a> instead, or look it up by name, for example <a href="/compound/caffeine">caffeine</a>.</p>',
    },
  ],
  faq: [
    {
      q: 'Is there a file size limit for local CIF files?',
      a: 'Local files can be up to 5 MB. Compressed .cif.gz files are checked at their compressed size, so gzip lets you open considerably larger structures. Entries fetched by PDB ID are downloaded directly from RCSB.',
    },
    {
      q: 'Do I need to convert mmCIF to PDB format first?',
      a: 'No. MolViewer reads mmCIF directly, and it is the better format anyway: it carries more metadata and has no limit on atoms or chains.',
    },
    {
      q: 'Can I open a CIF file from a small-molecule crystal structure?',
      a: 'Not at the moment. Those files use fractional unit-cell coordinates, and MolViewer reads only the Cartesian coordinates used in PDBx/mmCIF. Export the molecule as SDF, MOL or XYZ from your crystallography software and open that instead.',
    },
    {
      q: 'Where does the file go when I open it?',
      a: 'Nowhere. The file is parsed in your browser and stays on your device, unless you choose to create a share link for a scene that includes a small local file.',
    },
  ],
  cta: { label: 'Open the SARS-CoV-2 spike (6VXX) from mmCIF', href: '/pdb/6VXX?repr=cartoon&color=chain' },
  related: [
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'How to read a PDB file', href: '/learn/how-to-read-a-pdb-file' },
    { label: 'AlphaFold structure viewer', href: '/alphafold-viewer' },
    { label: 'SARS-CoV-2 structures', href: '/collections/sars-cov-2' },
    { label: 'Membrane proteins', href: '/collections/membrane-proteins' },
  ],
};
