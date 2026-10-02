import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/terms',
  kind: 'legal',
  updated: '2026-10-02',
  title: 'Terms of use | MolViewer',
  description:
    'Terms for using MolViewer and its ChatGPT and Claude app: free and provided as is, MIT-licensed code, and structure data under each source database license.',
  h1: 'Terms of use',
  intro:
    `<p>MolViewer (molviewer.bio and the MolViewer app for ChatGPT and Claude) is a free educational and research tool run by Gleb Shulga. By using it you agree to these terms. Contact: <a href="mailto:support@molviewer.bio">support@molviewer.bio</a>.</p>`,
  sections: [
    {
      heading: 'Free, as is',
      html:
        `<p>MolViewer is provided free of charge and "as is", without warranties of any kind, including accuracy, availability or fitness for a particular purpose. Structures and facts come from public databases and may contain errors or be out of date. Check important results against the original database entry and its publication.</p>`,
    },
    {
      heading: 'Not for medical or safety decisions',
      html:
        `<p>MolViewer is for viewing and learning about molecular structures. It does not give medical, dosing, synthesis or safety advice, and it must not be used to make decisions about health or the handling of hazardous substances. The chat app refuses to look up chemical warfare agents.</p>`,
    },
    {
      heading: 'Acceptable use',
      html:
        `<ul>` +
        `<li>Don't overload the service, for example with automated bulk requests. For bulk data, use the source databases' own APIs.</li>` +
        `<li>Don't try to break, bypass or probe the service's security.</li>` +
        `<li>Don't use share links to distribute content that is unlawful or that you have no right to share.</li>` +
        `</ul>` +
        `<p>Access may be rate limited or blocked to keep the service available for everyone.</p>`,
    },
    {
      heading: 'Licenses',
      html:
        `<ul>` +
        `<li><strong>Code:</strong> MolViewer's source code is released under the <a href="https://github.com/GlebShulga/molviewer/blob/main/LICENSE" rel="noopener">MIT license</a>.</li>` +
        `<li><strong>PDB data</strong> (RCSB PDB, PDBe) is available under CC0 1.0.</li>` +
        `<li><strong>AlphaFold DB</strong> predictions are available under CC BY 4.0. Cite Jumper et al. (2021) and Varadi et al. when you use them.</li>` +
        `<li><strong>PubChem</strong> data is provided by NCBI as a public resource. Individual records may carry terms from their contributing sources.</li>` +
        `<li><strong>UniProt</strong> annotation is available under CC BY 4.0.</li>` +
        `</ul>` +
        `<p>Images and videos you export are yours to use. Please credit the structure's source database and publication.</p>`,
    },
    {
      heading: 'Liability',
      html:
        `<p>To the extent the law allows, the operator is not liable for any loss or damage arising from the use of MolViewer or from relying on the information it shows.</p>`,
    },
    {
      heading: 'Changes',
      html:
        `<p>These terms may be updated. The new version is published here with a new date, and continuing to use MolViewer after a change means you accept it. See also the <a href="/privacy">privacy policy</a>.</p>`,
    },
  ],
  related: [
    { label: 'Privacy policy', href: '/privacy' },
    { label: 'Support', href: '/support' },
    { label: 'About MolViewer', href: '/about' },
  ],
};
