import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/alphafold-viewer',
  kind: 'tool',
  updated: '2026-09-28',
  title: 'AlphaFold Structure Viewer with pLDDT Colors | MolViewer',
  description:
    'View AlphaFold predicted structures in 3D by UniProt accession, free in your browser with no install. Color by pLDDT confidence, measure and share.',
  h1: 'AlphaFold structure viewer',
  intro:
    '<p>MolViewer opens predicted protein structures from the AlphaFold Protein Structure Database by UniProt accession. Enter an accession such as <a href="/af/P69905">P69905</a> (human hemoglobin alpha) and the model loads in your browser, ready to color by confidence. It is free, needs no install, and also opens AlphaFold files you already have on disk.</p>',
  sections: [
    {
      heading: 'Load a prediction',
      html:
        '<p>Use the AlphaFold option in the load panel and type a UniProt accession, or open a URL of the form <code>/af/&lt;accession&gt;</code>. For example, <a href="/af/P04637">/af/P04637</a> loads the tumor suppressor p53. MolViewer fetches the model file directly from AlphaFold DB (run by EMBL-EBI and Google DeepMind), so the data never passes through our servers.</p>' +
        '<p>Have a model from AlphaFold Server, ColabFold or a local AlphaFold run? Drag the <code>.cif</code> or <code>.pdb</code> file onto the viewer. See the step-by-step guide on <a href="/learn/how-to-view-an-alphafold-prediction">how to view an AlphaFold prediction</a>.</p>',
    },
    {
      heading: 'See where the model is confident',
      html:
        '<p>Every AlphaFold residue has a pLDDT score from 0 to 100, stored in the B-factor column of the file. Choose the <strong>B-factor</strong> color scheme and MolViewer paints the model from blue (lowest score in the model) through white to red (highest). Hover any atom to read its exact value in the tooltip.</p>' +
        '<p>As a rule of thumb, pLDDT above 90 is very high confidence, 70–90 is confident, 50–70 is low and below 50 is very low, often a disordered region. The article <a href="/learn/plddt-explained">pLDDT explained</a> covers what the score does and does not tell you.</p>' +
        '<p>Note that the MolViewer scale stretches across the range present in each model rather than using the fixed four-color bands of the AlphaFold DB website, so compare exact values rather than colors between two models.</p>',
    },
    {
      heading: 'Compare prediction and experiment',
      html:
        '<p>Load up to 10 structures at once. Put the predicted alpha chain <a href="/af/P69905">P69905</a> next to the crystal structure of hemoglobin <a href="/pdb/4HHB">4HHB</a> in side-by-side layout, switch both to cartoon, and look at where they differ. Structures are not superposed automatically, so overlay mode shows each file in its own coordinates.</p>' +
        '<p>Measurements, 3D labels, the sequence viewer, PNG export and short share links all work on predicted models exactly as they do on <a href="/pdb-viewer">experimental PDB entries</a>.</p>',
    },
  ],
  faq: [
    {
      q: 'What do I need to open an AlphaFold structure?',
      a: 'Only a UniProt accession, for example P69905 or P04637, and a browser with WebGL 2. MolViewer downloads the model from AlphaFold DB in mmCIF format. Nothing is installed and no account is needed.',
    },
    {
      q: 'Why does the B-factor color scheme show confidence?',
      a: 'AlphaFold writes its per-residue confidence score, pLDDT, into the B-factor column of its PDB and mmCIF files. Coloring by B-factor therefore colors by pLDDT: blue for the least confident parts of the model and red for the most confident.',
    },
    {
      q: 'Can I trust the low-confidence regions?',
      a: 'Treat them with caution. Regions below about 50 are often intrinsically disordered or only become ordered when bound to a partner, and their coordinates should not be interpreted as a real shape. pLDDT is also local: it does not tell you whether two domains are placed correctly relative to each other.',
    },
    {
      q: 'Does MolViewer show the PAE plot?',
      a: 'No. MolViewer shows the 3D model and its per-residue pLDDT. The predicted aligned error (PAE) plot is available on each entry page of the AlphaFold DB website.',
    },
  ],
  cta: { label: 'Open an AlphaFold model colored by pLDDT', href: '/af/P69905?repr=cartoon&color=bfactor' },
  related: [
    { label: 'pLDDT explained', href: '/learn/plddt-explained' },
    { label: 'How to view an AlphaFold prediction', href: '/learn/how-to-view-an-alphafold-prediction' },
    { label: 'AlphaFold highlights', href: '/collections/alphafold-highlights' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'mmCIF / CIF file viewer', href: '/mmcif-viewer' },
  ],
};
