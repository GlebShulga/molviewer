import type { ContentPage } from '../../types';

export const page: ContentPage = {
  path: '/learn/plddt-explained',
  kind: 'learn',
  updated: '2026-09-28',
  title: 'pLDDT Explained: AlphaFold Confidence Scores | MolViewer',
  description:
    'What the AlphaFold pLDDT score measures, what the 90, 70 and 50 thresholds mean, how it differs from PAE and B-factors, and how to view it free in 3D.',
  h1: 'pLDDT explained: reading AlphaFold confidence',
  intro:
    `<p>Every AlphaFold model comes with its own error estimate. The most visible one is <strong>pLDDT</strong>, a number from 0 to 100 attached to each residue that says how confident AlphaFold is in the local structure around it. Reading pLDDT correctly is the difference between using a prediction well and over-interpreting it. This article explains where the score comes from, what its bands mean, and what it cannot tell you.</p>`,
  sections: [
    {
      heading: 'From lDDT to pLDDT',
      html:
        `<p>The score is built on <strong>lDDT</strong>, the local Distance Difference Test (Mariani and colleagues, 2013). lDDT compares a model with a reference structure without superposing them. For each atom it looks at the distances to nearby atoms, within 15 Å, and checks how many of those distances in the model match the reference within tolerances of 0.5, 1, 2 and 4 Å. The more distances that agree, the higher the score. Because it only looks at local neighborhoods, lDDT rewards a correct domain even if that domain is placed wrongly relative to the rest of the protein.</p>` +
        `<p>AlphaFold cannot compute lDDT for its own predictions, since the true structure is unknown. Instead, it was trained to <em>predict</em> the lDDT score, calculated on alpha carbons, that each residue would get if the real structure were available. That prediction is pLDDT: the "p" stands for predicted. It is scaled from 0 to 100.</p>`,
    },
    {
      heading: 'The four confidence bands',
      html:
        `<table>` +
        `<thead><tr><th>pLDDT</th><th>Band</th><th>Interpretation</th></tr></thead>` +
        `<tbody>` +
        `<tr><td>above 90</td><td>Very high</td><td>Backbone expected to be highly accurate; side chains usually well placed. Suitable for looking at detail such as binding-site geometry, with care.</td></tr>` +
        `<tr><td>70–90</td><td>Confident</td><td>Backbone generally correct; some side chains may be misplaced.</td></tr>` +
        `<tr><td>50–70</td><td>Low</td><td>Low confidence; the overall path may be wrong. Treat with caution.</td></tr>` +
        `<tr><td>below 50</td><td>Very low</td><td>Should not be interpreted as a structure. Often a sign of disorder.</td></tr>` +
        `</tbody></table>` +
        `<p>AlphaFold DB reports how much of each model falls in each band. For human p53 (<a href="/af/P04637?repr=cartoon&amp;color=bfactor">P04637</a>), about 53% of residues are very high, 7% confident, 10% low and 30% very low, with an average pLDDT of about 75. For human hemoglobin alpha (<a href="/af/P69905?repr=cartoon&amp;color=bfactor">P69905</a>) the average is about 98 and over 99% of residues are very high. An average hides a lot, so always look at where in the chain the low and high values fall.</p>`,
    },
    {
      heading: 'What low pLDDT usually means',
      html:
        `<p>There are three common reasons for a low score:</p>` +
        `<ol>` +
        `<li><strong>Intrinsic disorder.</strong> Many proteins contain regions that never adopt one fixed shape. Low pLDDT correlates strongly with such regions, so a model's very-low stretches work as a useful disorder prediction. In p53, the N-terminal transactivation region and the C-terminal tail fall in this category.</li>` +
        `<li><strong>Structure that needs a partner.</strong> Some segments only fold when bound to another protein, DNA or a ligand. Predicted on its own, such a segment may score low even though it has a well-defined bound shape.</li>` +
        `<li><strong>Too little information.</strong> AlphaFold relies heavily on alignments of related sequences. Proteins or regions with few known relatives can get low scores even if they are ordered in reality.</li>` +
        `</ol>` +
        `<p>The reverse also happens: some regions that are disordered on their own receive high pLDDT because AlphaFold predicts the shape they take when bound. High confidence means "AlphaFold is sure about this local structure", not "this is how the protein always looks in solution".</p>` +
        `<p>Whatever the cause, AlphaFold still outputs coordinates for every residue. In very-low regions these form long, smooth, ribbon-like loops that look nothing like a folded protein. Do not measure distances in them, and do not read biological meaning into their path.</p>`,
    },
    {
      heading: 'What pLDDT does not tell you',
      html:
        `<ul>` +
        `<li><strong>Domain placement.</strong> pLDDT is local. Two domains can each score above 90 while their relative orientation is uncertain. For that, use the <strong>predicted aligned error</strong> (PAE), a residue-by-residue matrix, in ångströms, of the expected position error of one residue when the model is aligned on another. Low PAE between two domains means their arrangement is reliable. AlphaFold DB shows the PAE plot on every entry page.</li>` +
        `<li><strong>Effects of mutations.</strong> AlphaFold was not designed to predict how a single amino acid change alters structure or stability, and pLDDT should not be used as a proxy for that.</li>` +
        `<li><strong>Flexibility in a crystal.</strong> pLDDT is not a B-factor. It measures the confidence of a prediction, not the thermal motion of atoms.</li>` +
        `</ul>`,
    },
    {
      heading: 'pLDDT and the B-factor column',
      html:
        `<p>AlphaFold stores pLDDT in the B-factor column of its PDB and mmCIF files, and many other structure prediction tools, such as ColabFold, do the same. That is convenient, because every viewer can already color by B-factor. It also means you must remember which kind of file you have open, because the two scales point in opposite directions:</p>` +
        `<ul>` +
        `<li>In an experimental structure, a <em>high</em> B-factor means an atom is mobile or poorly defined.</li>` +
        `<li>In an AlphaFold model, a <em>high</em> value means high confidence.</li>` +
        `</ul>` +
        `<p>In MolViewer the B-factor color scheme runs from blue (lowest value in the structure) through white to red (highest), so on an AlphaFold model red is the most confident and blue the least. Compare an experimental B-factor view such as <a href="/pdb/1CRN?repr=cartoon&amp;color=bfactor">crambin (1CRN)</a> with the p53 prediction, and note that red means the opposite thing in each.</p>`,
    },
    {
      heading: 'Try it',
      html:
        `<ol>` +
        `<li>Open <a href="/af/P04637?repr=cartoon&amp;color=bfactor">p53 colored by pLDDT</a>.</li>` +
        `<li>Find the DNA-binding core domain in the middle of the chain (red, most residues above 90), and the loose, blue termini.</li>` +
        `<li>Hover over atoms to read exact values. The color scale is stretched across the range in each model, so the numbers matter more than the shade.</li>` +
        `<li>Use the sequence viewer to find where confidence drops, and compare it with the domain boundaries listed for the protein in <a href="https://www.uniprot.org/uniprotkb/P04637" rel="noopener">UniProt</a>.</li>` +
        `</ol>` +
        `<p>For a full walk-through of loading and reading a prediction, see <a href="/learn/how-to-view-an-alphafold-prediction">how to view an AlphaFold prediction</a>.</p>`,
    },
  ],
  faq: [
    {
      q: 'What is a good pLDDT score?',
      a: 'Above 90 is very high confidence and above 70 is generally reliable for the backbone. Between 50 and 70 is low confidence, and below 50 usually indicates a disordered region that should not be interpreted as a structure.',
    },
    {
      q: 'What is the difference between pLDDT and PAE?',
      a: 'pLDDT is a per-residue score of local confidence. PAE is a matrix covering every pair of residues that estimates how well their relative positions are predicted. Use pLDDT to judge individual regions and PAE to judge how domains are arranged relative to each other.',
    },
    {
      q: 'Why do AlphaFold files have pLDDT in the B-factor column?',
      a: 'The PDB and mmCIF formats have no dedicated field for prediction confidence, and the B-factor column already holds one number per atom that every viewer can color by. Storing pLDDT there makes confidence visible in any existing tool.',
    },
  ],
  cta: { label: 'Open p53 colored by pLDDT', href: '/af/P04637?repr=cartoon&color=bfactor' },
  related: [
    { label: 'How to view an AlphaFold prediction', href: '/learn/how-to-view-an-alphafold-prediction' },
    { label: 'AlphaFold structure viewer', href: '/alphafold-viewer' },
    { label: 'AlphaFold highlights', href: '/collections/alphafold-highlights' },
    { label: 'How to read a PDB file', href: '/learn/how-to-read-a-pdb-file' },
  ],
};
