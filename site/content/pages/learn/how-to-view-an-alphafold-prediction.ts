import type { ContentPage } from '../../types';

export const page: ContentPage = {
  path: '/learn/how-to-view-an-alphafold-prediction',
  kind: 'learn',
  updated: '2026-09-28',
  title: 'How to View an AlphaFold Prediction in 3D | MolViewer',
  description:
    'A step-by-step guide to finding, opening and reading an AlphaFold protein model: UniProt accessions, pLDDT coloring and caveats. Free, in your browser.',
  h1: 'How to view an AlphaFold prediction',
  intro:
    `<p>AlphaFold, developed by Google DeepMind, predicts the 3D structure of a protein from its amino acid sequence. The AlphaFold Protein Structure Database, run with EMBL-EBI, holds over 200 million predicted models covering almost every protein sequence in UniProt. This guide shows how to open one of those models in your browser, read its confidence scores, and avoid the most common misreadings. We will use human p53, a tumor suppressor that is both well studied and partly disordered.</p>`,
  sections: [
    {
      heading: 'Step 1: find the UniProt accession',
      html:
        `<p>AlphaFold DB entries are indexed by <strong>UniProt accession</strong>, a stable identifier of six or ten characters such as <code>P04637</code>. The easiest way to find one is to search <a href="https://www.uniprot.org/" rel="noopener">UniProt</a> or <a href="https://alphafold.ebi.ac.uk/" rel="noopener">AlphaFold DB</a> by protein or gene name and check the organism. The same gene in different species has a different accession, so human p53 (<code>P04637</code>) and mouse p53 are separate entries with separate models.</p>` +
        `<p>Do not confuse accessions with other identifiers. <code>TP53</code> is a gene name, <code>P53_HUMAN</code> is a UniProt entry name, and <code>1TSR</code> is a PDB ID for an experimental structure.</p>`,
    },
    {
      heading: 'Step 2: open the model',
      html:
        `<p>In MolViewer, choose the AlphaFold option in the load panel and paste the accession, or go straight to a URL of the form <code>/af/&lt;accession&gt;</code>. For p53 that is <a href="/af/P04637">/af/P04637</a>. MolViewer asks AlphaFold DB for the latest model and downloads it in mmCIF format directly to your browser.</p>` +
        `<p>If you ran a prediction yourself, with AlphaFold Server, ColabFold or a local installation, drag the resulting <code>.cif</code> or <code>.pdb</code> file onto the viewer instead. The rest of this guide applies the same way.</p>`,
    },
    {
      heading: 'Step 3: color by confidence',
      html:
        `<p>A predicted structure is only useful if you know which parts to trust. AlphaFold gives every residue a confidence score, <strong>pLDDT</strong>, from 0 to 100, and writes it into the B-factor column of the file. Switch to cartoon and choose the <strong>B-factor</strong> color scheme, or open <a href="/af/P04637?repr=cartoon&amp;color=bfactor">p53 colored by pLDDT</a> directly.</p>` +
        `<p>MolViewer colors from blue for the lowest value in the model, through white, to red for the highest. Hover any atom to read its exact pLDDT in the tooltip. The usual interpretation bands are:</p>` +
        `<table>` +
        `<thead><tr><th>pLDDT</th><th>Confidence</th><th>What it usually means</th></tr></thead>` +
        `<tbody>` +
        `<tr><td>above 90</td><td>Very high</td><td>Backbone and most side chains likely accurate</td></tr>` +
        `<tr><td>70–90</td><td>Confident</td><td>Backbone generally correct</td></tr>` +
        `<tr><td>50–70</td><td>Low</td><td>Treat with caution</td></tr>` +
        `<tr><td>below 50</td><td>Very low</td><td>Often disordered; do not interpret the shape</td></tr>` +
        `</tbody></table>` +
        `<p>The MolViewer scale is relative to each model. In the hemoglobin alpha model <a href="/af/P69905?repr=cartoon&amp;color=bfactor">P69905</a>, almost every residue scores above 90, so even the "blue" end is high confidence. Always check the numbers, not just the colors. For more on the score itself, read <a href="/learn/plddt-explained">pLDDT explained</a>.</p>`,
    },
    {
      heading: 'Step 4: read the model',
      html:
        `<p>In the p53 model, two regions stand out as well predicted: the DNA-binding core domain in the middle of the chain (roughly residues 100 to 290, pLDDT mostly above 90) and a short tetramerization region near residue 330. The N-terminal region, the linker after the core, and the C-terminal tail score far lower, many residues below 50. They appear as long, loosely wandering loops.</p>` +
        `<p>Those loops are not a real structure. The N- and C-terminal regions of p53 are intrinsically disordered: in the cell they do not hold a single fixed shape, and some fold only when p53 binds a partner protein. AlphaFold signals this by assigning low pLDDT, but it still has to place the atoms somewhere, so it draws them as extended ribbons. Ignore their exact path, and do not measure distances inside them.</p>` +
        `<p>Open the sequence viewer to connect the colors to residue numbers. Clicking a residue highlights it in 3D.</p>`,
    },
    {
      heading: 'Step 5: compare with experiment',
      html:
        `<p>For many proteins an experimental structure also exists. MolViewer can show up to 10 structures side by side, so load the AlphaFold model next to the crystal structure of the p53 core domain bound to DNA, <a href="/pdb/1TSR">1TSR</a>, or put the hemoglobin alpha model next to <a href="/pdb/4HHB">4HHB</a>. The files are not superposed automatically, so compare them in side-by-side layout and orient each one yourself.</p>` +
        `<p>You will notice that the experimental hemoglobin has heme groups and the prediction does not. The model you open by UniProt accession contains only that one protein chain: no ligands, cofactors, metal ions, water or partner proteins. It was predicted on its own, so it cannot show how the four chains of hemoglobin fit together.</p>`,
    },
    {
      heading: 'Step 6: save and share',
      html:
        `<p>Create a short share link to send a colleague or class exactly your view, including camera angle, measurements and labels. Export a PNG at up to 4x resolution for slides or a report, and remember to cite both AlphaFold and AlphaFold DB, and the model version shown on the entry page.</p>`,
    },
  ],
  faq: [
    {
      q: 'Is an AlphaFold model as reliable as an experimental structure?',
      a: 'In very high confidence regions, AlphaFold backbones are often close to experimental structures, but a prediction is still a model and not a measurement. Check pLDDT residue by residue, and prefer an experimental structure when one exists for the question you are asking.',
    },
    {
      q: 'Why does the model look like spaghetti at the ends?',
      a: 'Those regions have low pLDDT, often because the protein is intrinsically disordered there. AlphaFold must still output coordinates, so it draws extended loops that should not be read as a real structure.',
    },
    {
      q: 'Can I see complexes or ligands?',
      a: 'Opening a UniProt accession loads the single-chain model. Since 2026 AlphaFold DB also offers millions of predicted homodimers and heterodimers, and AlphaFold Server, based on AlphaFold 3, can model complexes with nucleic acids and ligands. Download the mmCIF file of such a model and drag it into MolViewer.',
    },
  ],
  cta: { label: 'Open p53 colored by pLDDT', href: '/af/P04637?repr=cartoon&color=bfactor' },
  related: [
    { label: 'pLDDT explained', href: '/learn/plddt-explained' },
    { label: 'AlphaFold structure viewer', href: '/alphafold-viewer' },
    { label: 'AlphaFold highlights', href: '/collections/alphafold-highlights' },
    { label: 'Hemoglobin and oxygen transport', href: '/collections/hemoglobin-oxygen-transport' },
    { label: 'Alpha helices and beta sheets', href: '/learn/alpha-helices-and-beta-sheets' },
  ],
};
