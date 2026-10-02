import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/privacy',
  kind: 'legal',
  updated: '2026-10-02',
  title: 'Privacy policy | MolViewer',
  description:
    'What MolViewer collects on molviewer.bio and in its ChatGPT and Claude app: anonymous usage counts, no accounts, no tracking cookies, and no sale of data.',
  h1: 'Privacy policy',
  intro:
    `<p>MolViewer is a free molecule viewer run by Gleb Shulga, an independent developer. It has no accounts and no advertising, and it never sells or shares personal data. This page explains what the website (molviewer.bio) and the MolViewer app for ChatGPT and Claude receive, what is stored and for how long. Questions: <a href="mailto:support@molviewer.bio">support@molviewer.bio</a>.</p>`,
  sections: [
    {
      heading: 'The website',
      html:
        `<ul>` +
        `<li><strong>Structures</strong> are downloaded by your browser directly from RCSB PDB, AlphaFold DB (EMBL-EBI) and PubChem (NCBI). Those services see the request, including your IP address, under their own policies.</li>` +
        `<li><strong>Files you open</strong> from your computer are processed on your device and never uploaded, unless you create a share link for a scene that includes a small local file. That file is then stored with the link.</li>` +
        `<li><strong>Share links</strong> (/s/...) store the scene you chose to share (structure references, view settings, measurements and labels) for one year.</li>` +
        `<li><strong>Saved sessions and preferences</strong> stay in your browser's local storage and never leave your device.</li>` +
        `<li><strong>Analytics:</strong> Cloudflare Web Analytics counts page views without cookies or personal profiles. MolViewer also records anonymous product events, such as "a structure was loaded from PubChem" or "a PNG was exported", with the page type and the country Cloudflare derives from the request. No IP address, cookie, account or device identifier is stored with them.</li>` +
        `<li><strong>Error reports:</strong> if the app hits an error, a short report (the message, the page address and your browser version) is sent to New Relic so the bug can be fixed.</li>` +
        `</ul>`,
    },
    {
      heading: 'The MolViewer app in ChatGPT and Claude',
      html:
        `<p>When you ask ChatGPT or Claude to show or look up a structure, the chat service calls MolViewer's server (mcp.molviewer.bio).</p>` +
        `<ul>` +
        `<li><strong>What the server receives:</strong> only the tool request, meaning the search text or structure ID the assistant chose (for example "hemoglobin" or "4HHB") and view options such as style and color. ChatGPT also sends an anonymized user identifier, which is used only to apply rate limits and is not stored. MolViewer never receives your conversation, name, email address or account details.</li>` +
        `<li><strong>What the server does with it:</strong> it looks the request up in MolViewer's catalogs and in RCSB PDB, PDBe, AlphaFold DB, UniProt and PubChem, and returns structure facts. Answers about public structures are cached for 24 hours, keyed by the request, without any user identifier.</li>` +
        `<li><strong>What is recorded:</strong> an anonymous count per request: which tool ran, the kind of structure, which chat service called, whether it succeeded and how long it took. Search text and structure IDs are not recorded.</li>` +
        `<li><strong>The 3D viewer in the chat</strong> downloads the structure file directly from RCSB, AlphaFold DB or PubChem, as the website does, and records two anonymous events: that the viewer was shown, and whether "Open full viewer" was used.</li>` +
        `</ul>`,
    },
    {
      heading: 'Service providers and retention',
      html:
        `<ul>` +
        `<li><strong>Cloudflare</strong> hosts the website and the app server. Its request logs, which include IP addresses, are kept for a few days for debugging and abuse protection. The anonymous usage counts are kept for up to three months.</li>` +
        `<li><strong>New Relic</strong> stores website error reports for up to 30 days.</li>` +
        `<li>Data is processed in the countries where these providers operate, including the United States and the European Union.</li>` +
        `</ul>`,
    },
    {
      heading: 'Your choices',
      html:
        `<p>Apart from the structure downloads and the anonymous counts above, nothing leaves your device. Blocking scripts from cloudflareinsights.com turns off page-view analytics. Because MolViewer stores nothing that identifies you, there is no personal profile to access or delete. To remove a share link you created, email <a href="mailto:support@molviewer.bio">support@molviewer.bio</a> with the link.</p>`,
    },
    {
      heading: 'Children',
      html: `<p>MolViewer is suitable for school use and does not knowingly collect personal information from anyone, including children under 13.</p>`,
    },
    {
      heading: 'Changes',
      html: `<p>If this policy changes, the new version is published here with a new date. The code that implements it is public on <a href="https://github.com/GlebShulga/molviewer" rel="noopener">GitHub</a>.</p>`,
    },
  ],
  related: [
    { label: 'Terms of use', href: '/terms' },
    { label: 'Support', href: '/support' },
    { label: 'About MolViewer', href: '/about' },
  ],
};
