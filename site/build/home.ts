/**
 * The home page's #page-info: the page's only H1 (visually hidden, because the
 * welcome screen inside the viewer carries the visible heading), a short intro
 * that links the format pages, and the site footer, whose Topics column links
 * the featured collection hubs. Injected into index.html at build (and in dev)
 * by site/build/vitePlugin.ts. It stays visible whatever the viewer loads, so
 * the intro must not describe one structure.
 */
import { FEATURED_COLLECTIONS } from '../collections';
import { renderFooter } from '../nav';

export function renderHomeContent(): string {
  return `<h1 class="visually-hidden">MolViewer: free online 3D molecule viewer</h1>
<div class="home-intro">
<p>MolViewer is a free 3D molecule viewer that runs in your browser, with nothing to install. Drop in a structure file or look one up by ID: use it as a <a href="/pdb-viewer">PDB file viewer</a>, open <a href="/mmcif-viewer">mmCIF files</a>, <a href="/sdf-viewer">SDF and MOL files</a> or <a href="/xyz-viewer">XYZ files</a>, or explore <a href="/alphafold-viewer">AlphaFold predictions</a>. Files you open are read on your own device.</p>
<p>It works for proteins, nucleic acids and small molecules alike. Load a protein structure to see its helices and sheets in cartoon view, add a surface, color it by B-factor or measure distances between atoms. Open a small molecule to check bond lengths and angles, or browse nearly a thousand <a href="/compounds">small molecules from PubChem</a> in 3D. Structures from the PDB, AlphaFold or PubChem can be shared as a link, and any view can be saved as an image.</p>
<p>Students use MolViewer to explore structures from their textbooks, teachers to show a molecule in class without installing anything, and researchers to take a quick look at a file before opening heavier software. If you are not sure where to start, browse <a href="/collections">curated structures</a> on hemoglobin, antibodies, SARS-CoV-2 or DNA, or see how MolViewer <a href="/compare">compares to other molecular viewers</a>.</p>
</div>
${renderFooter(FEATURED_COLLECTIONS)}`;
}
