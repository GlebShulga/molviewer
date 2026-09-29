import type { ContentPage } from '../types';

export const page: ContentPage = {
  path: '/compare',
  kind: 'tool',
  updated: '2026-09-28',
  title: 'MolView vs Mol* vs NGL vs iCn3D Compared | MolViewer',
  description:
    'An honest comparison of free web molecule viewers: MolViewer, MolView, Mol*, NGL Viewer and iCn3D. What each does best, licenses, and when to pick which.',
  h1: 'Web molecule viewers compared',
  intro:
    '<p>Several free viewers show molecules in 3D in a browser, with no install. They are built for different jobs. This page compares MolViewer with four well-known alternatives, including the places where MolViewer is the weaker choice. Details were checked against the official site of each project in September 2026.</p>',
  sections: [
    {
      heading: 'At a glance',
      html:
        '<table>' +
        '<thead><tr><th></th><th>MolViewer</th><th>MolView</th><th>Mol*</th><th>NGL Viewer</th><th>iCn3D</th></tr></thead>' +
        '<tbody>' +
        '<tr><th>Made by</th><td>Independent developer</td><td>Herman Bergwerf</td><td>PDBe, RCSB PDB and partners</td><td>Alexander Rose and contributors</td><td>NCBI</td></tr>' +
        '<tr><th>License</th><td>MIT</td><td>Free to use; new app has paid plans</td><td>MIT</td><td>MIT</td><td>US Government work (public domain)</td></tr>' +
        '<tr><th>Best at</th><td>Quick viewing, teaching, sharing</td><td>Drawing small molecules</td><td>Large structures and analysis</td><td>Embedding in your own code</td><td>NCBI annotations and analysis</td></tr>' +
        '<tr><th>PDB entries by ID</th><td>Yes</td><td>Legacy app only</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>' +
        '<tr><th>AlphaFold by UniProt ID</th><td>Yes</td><td>No</td><td>Yes</td><td>Via file or URL</td><td>Yes</td></tr>' +
        '<tr><th>2D sketcher</th><td>No</td><td>Yes</td><td>No</td><td>No</td><td>No</td></tr>' +
        '<tr><th>Density maps and volumes</th><td>No</td><td>No</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>' +
        '<tr><th>MD trajectories</th><td>No</td><td>No</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>' +
        '<tr><th>Scripting</th><td>No</td><td>No</td><td>Plugin API, MolViewSpec</td><td>JavaScript API, selection language</td><td>Commands, Python and Node.js</td></tr>' +
        '</tbody></table>',
    },
    {
      heading: 'The alternatives in brief',
      html:
        '<p><strong><a href="https://molstar.org/" rel="noopener">Mol*</a></strong> (Molstar) is the most capable of the group. It powers the structure views on RCSB PDB, PDBe and AlphaFold DB, handles assemblies with millions of atoms, shows cryo-EM and crystallographic volumes, plays trajectories and saves full sessions. The price is a denser interface. If you need maps or huge complexes, use Mol*.</p>' +
        '<p><strong><a href="https://molview.org/" rel="noopener">MolView</a></strong> started as a chemistry teaching tool: draw a structure and see it in 3D, search PubChem, view crystals and spectra. The original molview.org app is still free but marked deprecated. Its successor at molview.com focuses on sketching small molecules, has dropped protein viewing, and sells subscriptions for saving and SVG export.</p>' +
        '<p><strong><a href="https://github.com/nglviewer/ngl" rel="noopener">NGL Viewer</a></strong> is a WebGL library for developers. It reads many structure, density and trajectory formats and is the engine behind tools such as NGLview for Jupyter.</p>' +
        '<p><strong><a href="https://www.ncbi.nlm.nih.gov/Structure/icn3d/" rel="noopener">iCn3D</a></strong> from NCBI links structures to sequence annotations such as conserved domains, SNPs and ClinVar variants. It creates share links, loads density maps and trajectories, exports STL for 3D printing, and supports batch scripting.</p>',
    },
    {
      heading: 'Where MolViewer fits',
      html:
        '<p>MolViewer aims to be the fastest way from a PDB ID, UniProt accession or file to a clear view you can share. It opens <a href="/pdb/4HHB">PDB entries</a>, <a href="/af/P04637">AlphaFold models</a>, <a href="/compound/aspirin">small molecules</a> and local PDB, mmCIF, SDF, MOL and XYZ files. It offers cartoon, stick and surface views, measurements, a sequence viewer, up to 10 structures side by side, short share links that restore the whole scene, and an <code>&lt;iframe&gt;</code> embed for course pages. It does not do density maps, trajectories, docking, editing or scripting. For a desktop comparison, see <a href="/pymol-online-alternative">MolViewer as a PyMOL alternative</a>.</p>',
    },
  ],
  faq: [
    {
      q: 'Which free web viewer is best for students?',
      a: 'For small molecules drawn from scratch, MolView. For proteins, MolViewer and iCn3D both open a structure from an ID with no install, and MolViewer keeps the interface small and makes it easy to send a class a link to an exact view.',
    },
    {
      q: 'Is Mol* better than MolViewer?',
      a: 'For research-grade analysis, yes: Mol* handles far larger structures, volumes and trajectories. MolViewer trades that breadth for a simpler interface, quick sharing and teaching use.',
    },
    {
      q: 'Can MolView still show proteins?',
      a: 'The original app at molview.org still loads macromolecules from the PDB. The newer app at molview.com focuses on small molecules and no longer includes protein viewing.',
    },
    {
      q: 'Are all of these tools free?',
      a: 'Mol*, NGL Viewer, iCn3D and MolViewer are free and open source or public domain. MolView is free to use for sketching and viewing, with paid plans for extra features in the new app.',
    },
  ],
  cta: { label: 'Try MolViewer with hemoglobin', href: '/pdb/4HHB?repr=cartoon&color=chain' },
  related: [
    { label: 'Free PyMOL alternative', href: '/pymol-online-alternative' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'AlphaFold structure viewer', href: '/alphafold-viewer' },
    { label: 'SDF and MOL file viewer', href: '/sdf-viewer' },
    { label: 'About MolViewer', href: '/about' },
  ],
};
