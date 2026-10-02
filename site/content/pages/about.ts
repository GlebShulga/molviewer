import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/about',
  kind: 'about',
  updated: '2026-10-02',
  title: 'About MolViewer: License, Citation, Privacy | MolViewer',
  description:
    'MolViewer is a free, open-source 3D molecule viewer that runs in your browser with no install. Who builds it, the MIT license, how to cite it, and privacy.',
  h1: 'About MolViewer',
  intro:
    `<p>MolViewer is a free, open-source viewer for 3D molecular structures that runs entirely in your browser. It opens proteins from the <a href="https://www.rcsb.org/" rel="noopener">RCSB Protein Data Bank</a>, predicted models from <a href="https://alphafold.ebi.ac.uk/" rel="noopener">AlphaFold DB</a>, small molecules from <a href="https://pubchem.ncbi.nlm.nih.gov/" rel="noopener">PubChem</a>, and your own PDB, mmCIF, SDF, MOL and XYZ files.</p>`,
  sections: [
    {
      heading: 'Who makes it',
      html:
        `<p>MolViewer is built and maintained by Gleb Shulga, an independent developer. The aim is to make looking at structures quick and approachable for students, teachers and researchers. Development happens in the open. Bug reports, feature requests and pull requests are welcome on <a href="https://github.com/GlebShulga/molviewer" rel="noopener">GitHub</a>.</p>`,
    },
    {
      heading: 'License',
      html:
        `<p>The source code is released under the MIT license. You may use, copy, modify and redistribute it, including for commercial work, as long as the copyright notice is kept. Structures you view remain under the terms of the database they come from: PDB and AlphaFold DB data are freely available under CC0 and CC-BY 4.0 respectively.</p>`,
    },
    {
      heading: 'How to cite MolViewer',
      html:
        `<p>If MolViewer helped with a paper, thesis or course, please cite the software and the date you accessed it, for example:</p>` +
        `<p><em>Shulga G. MolViewer: a web-based 3D molecular structure viewer. https://molviewer.bio. Source code: https://github.com/GlebShulga/molviewer (accessed 28 September 2026).</em></p>` +
        `<p>A <code>CITATION.cff</code> file in the root of the repository gives the same details in a machine-readable form, and GitHub shows a “Cite this repository” button from it. Please also cite the original structure: its PDB ID and primary publication, or the AlphaFold DB entry.</p>`,
    },
    {
      heading: 'Privacy',
      html:
        `<ul>` +
        `<li>Structures are fetched by your browser directly from RCSB PDB, AlphaFold DB or PubChem.</li>` +
        `<li>Files you open from your computer are processed on your device and never leave it, except when you choose to create a share link for a scene that includes a small local file. That file is then stored with the link so others can open it.</li>` +
        `<li>Saved sessions and preferences stay in your browser storage.</li>` +
        `<li>We use Cloudflare Web Analytics for anonymous product analytics. It does not use cookies or build personal profiles.</li>` +
        `<li>If the app hits an error, a short error report (the message, the page address and your browser version) is sent to New Relic so the bug can be fixed.</li>` +
        `</ul>` +
        `<p>The full <a href="/privacy">privacy policy</a> also covers anonymous usage counts and the MolViewer app for ChatGPT and Claude. See also the <a href="/terms">terms of use</a>, and <a href="/support">support</a> for questions.</p>`,
    },
  ],
  cta: { label: 'Open the viewer with ubiquitin', href: '/pdb/1UBQ' },
  related: [
    { label: 'Privacy policy', href: '/privacy' },
    { label: 'Compare web molecule viewers', href: '/compare' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'AlphaFold structure viewer', href: '/alphafold-viewer' },
    { label: 'How to read a PDB file', href: '/learn/how-to-read-a-pdb-file' },
  ],
};
