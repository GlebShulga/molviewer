import type { ContentPage } from '../types';
import { CHATGPT_APP_URL } from '../../nav';

export const page: ContentPage = {
  path: '/support',
  kind: 'legal',
  updated: '2026-10-05',
  title: 'Support and contact | MolViewer',
  description:
    'Get help with MolViewer and its ChatGPT and Claude app: report a bug, ask a question or suggest a feature by email or on GitHub. Free and open source.',
  h1: 'Support',
  intro:
    `<p>MolViewer is maintained by one developer, Gleb Shulga. Questions, bug reports and ideas are all welcome, and replies usually come within a few working days.</p>`,
  sections: [
    {
      heading: 'Contact',
      html:
        `<ul>` +
        `<li><strong>Email:</strong> <a href="mailto:support@molviewer.bio">support@molviewer.bio</a></li>` +
        `<li><strong>Bugs and feature requests:</strong> <a href="https://github.com/GlebShulga/molviewer/issues" rel="noopener">GitHub Issues</a></li>` +
        `<li><strong>Questions and ideas:</strong> <a href="https://github.com/GlebShulga/molviewer/discussions" rel="noopener">GitHub Discussions</a></li>` +
        `</ul>`,
    },
    {
      heading: 'Reporting a problem',
      html:
        `<p>Please include what you were trying to view (a PDB ID, UniProt accession or compound name, or the link from the address bar), what you expected and what happened instead, and your browser and device. For the chat app, say whether it was ChatGPT or Claude and include the prompt you used. Don't send personal or confidential data.</p>`,
    },
    {
      heading: 'The MolViewer app in ChatGPT and Claude',
      html:
        `<p>In ChatGPT, add MolViewer from its <a href="${CHATGPT_APP_URL}" rel="noopener">page in the plugin directory</a>.</p>` +
        `<p>Ask the assistant to show a structure, for example "Show me hemoglobin in 3D", "What does caffeine look like?" or "Show the AlphaFold model of human p53". The viewer appears in the chat. Use "Open full viewer" for measurements, sharing and export on molviewer.bio.</p>` +
        `<ul>` +
        `<li><strong>Nothing appears:</strong> the source database may be slow or down. Use the Retry button in the viewer, or ask again a minute later.</li>` +
        `<li><strong>"Not found":</strong> check the ID. PDB IDs have 4 characters (4HHB), and AlphaFold models use UniProt accessions (P04637). You can also ask by name.</li>` +
        `<li><strong>"MolViewer is busy":</strong> a rate limit protects the service. Try again in a minute.</li>` +
        `</ul>`,
    },
  ],
  cta: { label: 'Open the viewer with ubiquitin', href: '/pdb/1UBQ' },
  related: [
    { label: 'Privacy policy', href: '/privacy' },
    { label: 'Terms of use', href: '/terms' },
    { label: 'About MolViewer', href: '/about' },
  ],
};
