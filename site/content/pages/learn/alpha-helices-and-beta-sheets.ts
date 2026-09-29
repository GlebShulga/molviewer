import type { ContentPage } from '../../types';

export const page: ContentPage = {
  path: '/learn/alpha-helices-and-beta-sheets',
  kind: 'learn',
  updated: '2026-09-28',
  title: 'Alpha Helices and Beta Sheets Explained in 3D | MolViewer',
  description:
    'How alpha helices and beta sheets form, how hydrogen bonds hold them together, and how to spot them in real proteins, free in your browser with no install.',
  h1: 'Alpha helices and beta sheets',
  intro:
    `<p>A protein chain does not fold at random. Long stretches of it settle into a few regular, repeating shapes called <strong>secondary structure</strong>. The two most common are the alpha helix and the beta sheet, first proposed by Linus Pauling, Robert Corey and Herman Branson in 1951, years before the first protein structure was solved. This article explains what holds them together, how to tell them apart, and where to see them in 3D.</p>`,
  sections: [
    {
      heading: 'Hydrogen bonds in the backbone',
      html:
        `<p>Every amino acid in a chain contributes the same backbone unit: an N-H group, the alpha carbon (Cα) that carries the side chain, and a C=O group. The N-H is a hydrogen-bond donor and the C=O is an acceptor. Secondary structure is simply a regular pattern of hydrogen bonds between these backbone groups. Side chains are not involved in the bonds themselves, which is why the same shapes appear in proteins with completely different sequences.</p>` +
        `<p>The peptide bond between residues is planar, so the backbone can only twist at two bonds per residue: the N-Cα bond (angle phi, φ) and the Cα-C bond (angle psi, ψ). Each type of secondary structure corresponds to a particular pair of φ and ψ values repeated residue after residue. A Ramachandran plot, which maps φ against ψ, shows helices and strands as two distinct clusters.</p>`,
    },
    {
      heading: 'The alpha helix',
      html:
        `<p>In an alpha helix the backbone winds into a right-handed spiral. The C=O of each residue <em>i</em> forms a hydrogen bond with the N-H of residue <em>i</em> + 4, so every backbone group inside the helix is bonded, and the bonds run roughly parallel to the helix axis. Key numbers:</p>` +
        `<ul>` +
        `<li>3.6 residues per turn.</li>` +
        `<li>A rise of about 1.5 Å per residue, giving a pitch of about 5.4 Å per turn.</li>` +
        `<li>Backbone angles near φ = −60° and ψ = −45°.</li>` +
        `</ul>` +
        `<p>The side chains point outward from the helix like the bristles of a bottle brush. Because 3.6 residues make a turn, residues three or four apart in sequence end up on the same face. When one face is hydrophobic and the other polar, the helix is called <strong>amphipathic</strong>, and it often lies on the surface of a protein with its oily face tucked inside. Helices that cross cell membranes are typically around 20 residues of mostly hydrophobic amino acids, enough to span the roughly 30 Å thick core of the lipid bilayer.</p>` +
        `<p>Some amino acids favor helices (alanine, leucine, glutamate, methionine) and some disrupt them. Proline is the classic helix breaker: its side chain loops back onto the backbone nitrogen, so it has no N-H to donate and cannot fit the helical geometry except in the first turn. Glycine is so flexible that it also tends to end helices.</p>` +
        `<p>Myoglobin, the oxygen store of muscle and the first protein whose structure was determined by X-ray crystallography, is built almost entirely from eight alpha helices. Open <a href="/pdb/1MBN?repr=cartoon&amp;color=secondaryStructure">myoglobin (1MBN)</a> to see them packed around the heme group.</p>`,
    },
    {
      heading: 'The beta sheet',
      html:
        `<p>A beta sheet is made of several <strong>beta strands</strong>, stretches of chain that are almost fully extended, lying side by side. Here the hydrogen bonds run between neighboring strands rather than within one strand. Each strand has backbone angles near φ = −120° and ψ = +130°, and adjacent residues are about 3.3–3.5 Å apart along the strand, more than twice the spacing in a helix.</p>` +
        `<p>Strands can pair in two ways:</p>` +
        `<ul>` +
        `<li><strong>Antiparallel</strong>: neighbors run in opposite directions (N to C next to C to N). A tight turn of two to five residues often links them, forming a beta hairpin.</li>` +
        `<li><strong>Parallel</strong>: neighbors run the same way, so the chain must make a longer crossover connection, often through an alpha helix, to get back to the start.</li>` +
        `</ul>` +
        `<p>Many sheets are mixed. Because of the tetrahedral geometry at each Cα, the sheet is pleated like a folded fan, and consecutive side chains point alternately above and below it. A sheet is also rarely flat: most are twisted, and some curl all the way round into a closed barrel.</p>` +
        `<p>Green fluorescent protein is a striking example: eleven beta strands form a barrel with the light-emitting chromophore held in the middle. See it in <a href="/pdb/1EMA?repr=cartoon&amp;color=secondaryStructure">GFP (1EMA)</a>.</p>`,
    },
    {
      heading: 'Loops, turns and other helices',
      html:
        `<p>Not every residue is in a helix or a strand. Loops and turns connect them, and they are often where the protein is most flexible and where binding sites and active sites sit. Two rarer helices also appear: the tighter <strong>3₁₀ helix</strong>, with <em>i</em> to <em>i</em> + 3 hydrogen bonds, often found as a single turn at the end of an alpha helix, and the wider <strong>pi helix</strong>, with <em>i</em> to <em>i</em> + 5 bonds.</p>` +
        `<p>Helices and strands combine into recurring arrangements. Triose phosphate isomerase gave its name to the <strong>TIM barrel</strong>, in which eight parallel strands form an inner barrel surrounded by eight helices: <a href="/pdb/1TIM?repr=cartoon&amp;color=secondaryStructure">1TIM</a>. Ubiquitin, a small protein that tags others for degradation, packs one alpha helix against a mixed beta sheet: <a href="/pdb/1UBQ?repr=cartoon&amp;color=secondaryStructure">1UBQ</a>.</p>`,
    },
    {
      heading: 'How secondary structure is assigned',
      html:
        `<p>Secondary structure is not measured directly in an experiment. It is calculated from the atomic coordinates, most often with the DSSP algorithm (Kabsch and Sander, 1983), which finds the backbone hydrogen-bond patterns described above. The results are stored in the structure file, as HELIX and SHEET records in the PDB format or <code>_struct_conf</code> and <code>_struct_sheet_range</code> in mmCIF. See <a href="/learn/how-to-read-a-pdb-file">how to read a PDB file</a> for what those records contain.</p>` +
        `<p>MolViewer reads these records to draw its cartoon. If a file has none, it estimates helices and strands from the φ and ψ angles of each residue. That is a simpler method than DSSP, so short or irregular elements may differ slightly from the official assignment.</p>`,
    },
    {
      heading: 'See it for yourself',
      html:
        `<p>Open any protein in cartoon mode with the secondary-structure color scheme. Helices appear as spiral ribbons (magenta), strands as flat arrows pointing from the N- to the C-terminus (yellow), and loops as thin tubes. Good first examples:</p>` +
        `<ul>` +
        `<li><a href="/pdb/1CRN?repr=cartoon&amp;color=secondaryStructure">Crambin (1CRN)</a>: 46 residues, two helices and a small antiparallel sheet.</li>` +
        `<li><a href="/pdb/1MBN?repr=cartoon&amp;color=secondaryStructure">Myoglobin (1MBN)</a>: nearly all helix.</li>` +
        `<li><a href="/pdb/1EMA?repr=cartoon&amp;color=secondaryStructure">GFP (1EMA)</a>: nearly all sheet, closed into a barrel.</li>` +
        `<li><a href="/pdb/1TIM?repr=cartoon&amp;color=secondaryStructure">Triose phosphate isomerase (1TIM)</a>: alternating strands and helices.</li>` +
        `</ul>` +
        `<p>Click a residue in the sequence viewer below the 3D view to find it in the structure, then switch to stick view and use the measurement tool to check the hydrogen-bond distance between a C=O oxygen and an N-H nitrogen, typically around 2.8–3.0 Å.</p>`,
    },
  ],
  faq: [
    {
      q: 'What holds an alpha helix together?',
      a: 'Hydrogen bonds between backbone groups: the C=O of each residue bonds to the N-H of the residue four positions further along the chain. Side chains point outward and are not part of these bonds.',
    },
    {
      q: 'Is a beta sheet stronger than an alpha helix?',
      a: 'Neither is simply stronger. Both are stabilized by backbone hydrogen bonds, plus packing of side chains against the rest of the protein. Stability depends on the sequence and the surroundings, not on the type of secondary structure alone.',
    },
    {
      q: 'Why do proline residues break helices?',
      a: 'Proline has no hydrogen on its backbone nitrogen, so it cannot donate the hydrogen bond a helix needs, and its ring restricts the backbone angle phi. It is tolerated only in the first turn of a helix.',
    },
  ],
  cta: { label: 'Open crambin with secondary-structure colors', href: '/pdb/1CRN?repr=cartoon&color=secondaryStructure' },
  related: [
    { label: 'How to read a PDB file', href: '/learn/how-to-read-a-pdb-file' },
    { label: 'Enzymes', href: '/collections/enzymes' },
    { label: 'Membrane proteins', href: '/collections/membrane-proteins' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'Free PyMOL alternative', href: '/pymol-online-alternative' },
  ],
};
