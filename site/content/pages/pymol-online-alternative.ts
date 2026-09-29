import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/pymol-online-alternative',
  kind: 'tool',
  updated: '2026-09-28',
  title: 'Free Online PyMOL Alternative in Your Browser | MolViewer',
  description:
    'Need a quick PyMOL-style view without installing anything? MolViewer is a free, open-source 3D protein viewer in your browser. See what it does and does not do.',
  h1: 'A free online alternative to PyMOL',
  intro:
    '<p>PyMOL is the workhorse of structural biology figures, but it is a desktop program that has to be installed and, for the full Incentive build, licensed. When you only need to look at a structure, measure a distance or send a view to a colleague, MolViewer does the common tasks in the browser: free, open source, no install and no account.</p>',
  sections: [
    {
      heading: 'Common PyMOL tasks in MolViewer',
      html:
        '<table>' +
        '<thead><tr><th>In PyMOL</th><th>In MolViewer</th></tr></thead>' +
        '<tbody>' +
        '<tr><td><code>fetch 1ubq</code></td><td>Open <a href="/pdb/1UBQ">/pdb/1UBQ</a> or type the ID in the RCSB box</td></tr>' +
        '<tr><td><code>show cartoon</code></td><td>Cartoon representation</td></tr>' +
        '<tr><td><code>dss</code> and <code>color by ss</code></td><td>Secondary-structure color scheme, from the file or estimated from backbone angles</td></tr>' +
        '<tr><td><code>spectrum b</code></td><td>B-factor color scheme (also shows AlphaFold pLDDT)</td></tr>' +
        '<tr><td><code>spectrum count</code></td><td>Rainbow color scheme, N- to C-terminus</td></tr>' +
        '<tr><td><code>show surface</code></td><td>Van der Waals or solvent-accessible surface</td></tr>' +
        '<tr><td><code>distance</code>, <code>angle</code>, <code>dihedral</code></td><td>Measurement tools, or right-click an atom and choose Measure From Here</td></tr>' +
        '<tr><td><code>label</code></td><td>Right-click an atom and choose Add Label</td></tr>' +
        '<tr><td><code>png</code></td><td>PNG export at 1x, 2x or 4x, optional transparent background</td></tr>' +
        '<tr><td>Save a session</td><td>Save in the browser, or create a short share link anyone can open</td></tr>' +
        '</tbody></table>',
    },
    {
      heading: 'Where MolViewer helps',
      html:
        '<ul>' +
        '<li><strong>Nothing to install.</strong> Useful on locked-down lab or classroom computers, Chromebooks and phones.</li>' +
        '<li><strong>Links instead of files.</strong> A share link restores the structures, camera, measurements and labels, so a student or reviewer sees exactly your view. You can also embed a live viewer on a web page with an <code>&lt;iframe&gt;</code>.</li>' +
        '<li><strong>Sequence and structure together.</strong> Click a residue in the sequence viewer to find it in 3D.</li>' +
        '<li><strong>AlphaFold by accession.</strong> Load a predicted model such as <a href="/af/P04637">p53</a> and color it by confidence.</li>' +
        '</ul>',
    },
    {
      heading: 'Where PyMOL is the better tool',
      html:
        '<p>Be clear about the limits. PyMOL has a command language and a full Python API for scripting and automation; MolViewer has neither (a selection language is planned). PyMOL ray-traces publication-quality images, superposes structures with <code>align</code> and <code>super</code>, displays electron density maps, makes movies from trajectories, and has a large plugin ecosystem. MolViewer cannot open PyMOL <code>.pse</code> session files. For those jobs, keep PyMOL. The open-source build is free, and Schrödinger offers free educational-use builds to teachers and students for coursework, though not for research or publication.</p>' +
        '<p>Many people use both: PyMOL for final figures and analysis scripts, MolViewer for quick looks, teaching and sharing. See the <a href="/compare">comparison of web viewers</a> if you need maps or trajectories in a browser.</p>',
    },
  ],
  faq: [
    {
      q: 'Is there an online version of PyMOL?',
      a: 'PyMOL itself is a desktop application for Windows, macOS and Linux. MolViewer is a separate, free web viewer that covers everyday tasks such as fetching a PDB entry, cartoon and surface views, coloring, measurements and image export.',
    },
    {
      q: 'Can MolViewer run PyMOL scripts or open .pse files?',
      a: 'No. MolViewer has no scripting or command language yet and cannot read PyMOL session files. Open the underlying PDB or mmCIF file instead and rebuild the view with a few clicks.',
    },
    {
      q: 'Are MolViewer images good enough for a paper?',
      a: 'PNG export at up to 4x screen resolution with a transparent background works well for slides, posters and teaching material. For ray-traced figures with fine control over lighting and shadows, PyMOL or ChimeraX is still the better choice.',
    },
    {
      q: 'Is MolViewer free for research and commercial use?',
      a: 'Yes. MolViewer is open source under the MIT license, which permits academic, commercial and teaching use.',
    },
  ],
  cta: { label: 'Open ubiquitin (1UBQ) as a cartoon', href: '/pdb/1UBQ?repr=cartoon&color=secondaryStructure' },
  related: [
    { label: 'Compare web molecule viewers', href: '/compare' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'AlphaFold structure viewer', href: '/alphafold-viewer' },
    { label: 'Alpha helices and beta sheets', href: '/learn/alpha-helices-and-beta-sheets' },
    { label: 'About MolViewer', href: '/about' },
  ],
};
