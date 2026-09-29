import type { ContentPage } from '../../types';

/** Render a fixed-width PDB line with its spacing preserved. */
const pdbLine = (line: string): string => `<code>${line.replace(/ /g, '&nbsp;')}</code>`;

export const page: ContentPage = {
  path: '/learn/how-to-read-a-pdb-file',
  kind: 'learn',
  updated: '2026-09-28',
  title: 'How to Read a PDB File: Records and Columns | MolViewer',
  description:
    'A plain guide to the PDB file format: ATOM and HETATM lines, columns, occupancy, B-factors, HELIX, SHEET and CONECT records, with real examples to open.',
  h1: 'How to read a PDB file',
  intro:
    `<p>A PDB file is a plain text file that lists the position of every atom in a molecular structure, plus information about how the structure was determined. You can open one in any text editor. This guide walks through the parts that matter most, using two classic entries: crambin, a small plant protein (<a href="/pdb/1CRN">1CRN</a>), and human deoxyhemoglobin (<a href="/pdb/4HHB">4HHB</a>).</p>`,
  sections: [
    {
      heading: 'Fixed columns and record types',
      html:
        `<p>The format dates from the 1970s, the early years of the Protein Data Bank, and its 80-column lines mirror the punched cards of that era. Every piece of information lives in a fixed range of columns rather than being separated by commas or tabs. That is why a PDB file looks neatly aligned, and why editing it by hand can break it: shift a number by one column and a program may read the wrong value.</p>` +
        `<p>The first six characters of each line name its <strong>record type</strong>. The main ones, roughly in the order they appear, are:</p>` +
        `<ul>` +
        `<li><strong>HEADER, TITLE, COMPND, SOURCE, AUTHOR</strong>: what the molecule is, where it came from and who solved it.</li>` +
        `<li><strong>REMARK</strong>: numbered notes. <code>REMARK 2</code> gives the resolution (1.50 Å for crambin); <code>REMARK 350</code> describes the biological assembly.</li>` +
        `<li><strong>SEQRES</strong>: the full sequence of each chain, including residues that were not seen in the experiment.</li>` +
        `<li><strong>HELIX</strong> and <strong>SHEET</strong>: secondary structure.</li>` +
        `<li><strong>SSBOND</strong>: disulfide bonds.</li>` +
        `<li><strong>ATOM</strong> and <strong>HETATM</strong>: atomic coordinates, one atom per line.</li>` +
        `<li><strong>TER</strong>: the end of a polymer chain.</li>` +
        `<li><strong>CONECT</strong>: explicit bonds between atoms.</li>` +
        `<li><strong>END</strong>: the end of the file.</li>` +
        `</ul>`,
    },
    {
      heading: 'Anatomy of an ATOM line',
      html:
        `<p>Here is the first atom of crambin, the backbone nitrogen of threonine 1:</p>` +
        `<p>${pdbLine('ATOM      1  N   THR A   1      17.047  14.099   3.625  1.00 13.79           N')}</p>` +
        `<table>` +
        `<thead><tr><th>Columns</th><th>Field</th><th>Value here</th></tr></thead>` +
        `<tbody>` +
        `<tr><td>1–6</td><td>Record type</td><td><code>ATOM</code></td></tr>` +
        `<tr><td>7–11</td><td>Atom serial number</td><td><code>1</code></td></tr>` +
        `<tr><td>13–16</td><td>Atom name</td><td><code>N</code> (backbone nitrogen)</td></tr>` +
        `<tr><td>17</td><td>Alternate location indicator</td><td>blank</td></tr>` +
        `<tr><td>18–20</td><td>Residue name</td><td><code>THR</code> (threonine)</td></tr>` +
        `<tr><td>22</td><td>Chain identifier</td><td><code>A</code></td></tr>` +
        `<tr><td>23–26</td><td>Residue number</td><td><code>1</code></td></tr>` +
        `<tr><td>27</td><td>Insertion code</td><td>blank</td></tr>` +
        `<tr><td>31–38, 39–46, 47–54</td><td>x, y, z coordinates in Å</td><td><code>17.047</code>, <code>14.099</code>, <code>3.625</code></td></tr>` +
        `<tr><td>55–60</td><td>Occupancy</td><td><code>1.00</code></td></tr>` +
        `<tr><td>61–66</td><td>B-factor (temperature factor)</td><td><code>13.79</code></td></tr>` +
        `<tr><td>77–78</td><td>Element symbol</td><td><code>N</code></td></tr>` +
        `</tbody></table>` +
        `<p>Atom names follow a convention: <code>N</code>, <code>CA</code>, <code>C</code> and <code>O</code> are the backbone, and side-chain atoms are labelled with Greek letters spelled as Latin ones (<code>CB</code> for beta, <code>CG</code> for gamma, and so on). Note that <code>CA</code> means alpha carbon, not calcium; the element column resolves this.</p>`,
    },
    {
      heading: 'ATOM versus HETATM',
      html:
        `<p><strong>ATOM</strong> records hold the standard building blocks of polymers: the 20 common amino acids and the nucleotides of DNA and RNA. <strong>HETATM</strong> ("hetero atom") records hold everything else: ligands, cofactors, metal ions, water and chemically modified residues.</p>` +
        `<p>In hemoglobin, each of the four chains carries a heme group. Its iron atom in chain A looks like this:</p>` +
        `<p>${pdbLine('HETATM 4431 FE   HEM A 142      18.362  18.488  23.755  1.00 18.07          FE')}</p>` +
        `<p><code>HEM</code> is the three-letter code for heme in the PDB Chemical Component Dictionary. Water appears as <code>HOH</code>. Viewers often hide water by default because crystal structures can contain hundreds of water molecules.</p>`,
    },
    {
      heading: 'Occupancy and B-factor',
      html:
        `<p><strong>Occupancy</strong> is the fraction of molecules in the crystal in which the atom sits at this position. Most atoms have 1.00. When a side chain adopts two conformations, the file lists both with alternate location indicators <code>A</code> and <code>B</code> in column 17, and their occupancies add up to 1.00 (for example 0.60 and 0.40).</p>` +
        `<p>The <strong>B-factor</strong>, also called the temperature or displacement factor, measures how smeared out the atom's electron density is, in Å². It combines thermal vibration with static disorder between copies of the molecule. Low values (roughly 10–30 Å² in a well-ordered protein) mean a well-defined position; high values usually point to flexible loops, chain termini or surface side chains. Try coloring crambin by B-factor: <a href="/pdb/1CRN?repr=cartoon&amp;color=bfactor">1CRN colored by B-factor</a>.</p>` +
        `<p>Other methods reuse the column. In NMR structures it often carries no physical meaning, and AlphaFold models store a confidence score there instead (see <a href="/learn/plddt-explained">pLDDT explained</a>).</p>`,
    },
    {
      heading: 'HELIX, SHEET and CONECT',
      html:
        `<p>Secondary structure is listed before the coordinates. Crambin's first helix is:</p>` +
        `<p>${pdbLine('HELIX    1  H1 ILE A    7  PRO A   19  13/10 CONFORMATION RES 17,19       13')}</p>` +
        `<p>It runs from isoleucine 7 to proline 19 in chain A. The <code>1</code> before the comment is the helix class (1 is a right-handed alpha helix, 5 a right-handed 3₁₀ helix) and the final <code>13</code> is its length in residues. SHEET records work the same way for each strand, with one extra field, the <em>sense</em>: 0 for the first strand, 1 for a strand parallel to the previous one and −1 for antiparallel. Crambin's two strands, residues 1–4 and 32–35, are antiparallel.</p>` +
        `<p><strong>CONECT</strong> records list explicit bonds by serial number. Bonds inside standard residues are not listed, because every program knows how an alanine is connected. CONECT is used for ligands, metal coordination and disulfide bridges. In crambin, <code>CONECT 20 282</code> links the sulfur of cysteine 3 to the sulfur of cysteine 40, one of the protein's three disulfide bonds. In hemoglobin, <code>CONECT 650 4431</code> joins histidine 87 of chain A to the heme iron.</p>`,
    },
    {
      heading: 'Limits of the format, and mmCIF',
      html:
        `<p>Fixed columns impose hard limits: five digits for atom serial numbers (99,999 atoms), one character for the chain identifier (62 possible chains), and four digits for residue numbers. Ribosomes, viral capsids and many cryo-EM structures simply do not fit. Since 2014 the worldwide PDB has used PDBx/mmCIF as its standard archive format, and the largest structures are available only in that form. The ideas are the same, but each value is labelled by name, so there are no column limits. See the <a href="/mmcif-viewer">mmCIF viewer</a> page for details.</p>`,
    },
    {
      heading: 'Try it yourself',
      html:
        `<p>Open <a href="/pdb/1CRN">crambin</a> in MolViewer and hover over any atom: the tooltip shows the atom name, residue, chain, occupancy and B-factor straight from the file. Switch to <a href="/pdb/1CRN?repr=cartoon&amp;color=secondaryStructure">cartoon with secondary-structure colors</a> to see the HELIX and SHEET records drawn as ribbons and arrows, or open <a href="/pdb/4HHB">hemoglobin</a> and find the heme groups in ball-and-stick.</p>`,
    },
  ],
  faq: [
    {
      q: 'What is the difference between a .pdb file and a PDB ID?',
      a: 'A PDB ID is the four-character code of an entry in the Protein Data Bank, such as 1CRN. A .pdb file is one of the text formats that entry can be downloaded in. The same entry is also available as mmCIF, which is now the archive standard.',
    },
    {
      q: 'What units are the coordinates in?',
      a: 'Angstroms (1 Å = 0.1 nanometre), in a Cartesian frame. For crystal structures the frame is tied to the crystal, so the absolute numbers mean nothing on their own; only distances and angles between atoms do.',
    },
    {
      q: 'Why are some residues missing from the coordinates?',
      a: 'Flexible regions such as loops and chain ends often give too little electron density to model. Those residues still appear in SEQRES, and REMARK 465 lists them as missing.',
    },
  ],
  cta: { label: 'Open crambin (1CRN) in the viewer', href: '/pdb/1CRN?repr=cartoon&color=secondaryStructure' },
  related: [
    { label: 'Alpha helices and beta sheets', href: '/learn/alpha-helices-and-beta-sheets' },
    { label: 'Online PDB viewer', href: '/pdb-viewer' },
    { label: 'mmCIF / CIF file viewer', href: '/mmcif-viewer' },
    { label: 'Hemoglobin and oxygen transport', href: '/collections/hemoglobin-oxygen-transport' },
    { label: 'pLDDT explained', href: '/learn/plddt-explained' },
  ],
};
