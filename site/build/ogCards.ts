/**
 * Social preview cards (1200x630 PNG) for the PDB and AlphaFold entries in the
 * sitemap, rendered at build time with satori + resvg into dist/og/.
 *
 * Why build time: rendering takes far more CPU than the 10 ms a free-plan
 * Pages Function gets per request, and the bundle would grow by ~700 KB.
 * Cards use only our own data (no third-party images), so they're small,
 * deterministic and cacheable. Unchanged cards are reused from a local cache.
 *
 * Colors here are image pixels, not page CSS; they mirror the dark theme
 * tokens in src/index.css.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { AfSeed, PdbSeed } from '../dataTypes';
import { formatResolution, methodNoun } from '../render/format';

const WIDTH = 1200;
const HEIGHT = 630;
const CARD_VERSION = 1; // bump to invalidate the cache after design changes

const C = {
  bg: '#0d1117',
  panel: '#161b22',
  border: '#30363d',
  text: '#f0f6fc',
  muted: '#9eaab6',
  accent: '#58a6ff',
  // AlphaFold DB's pLDDT palette.
  veryHigh: '#0053d6',
  confident: '#65cbf3',
  low: '#ffdb13',
  veryLow: '#ff7d45',
};

export interface CardSpec {
  kind: 'pdb' | 'af';
  id: string;
  title: string;
  subtitle: string;
  tags: string[];
  plddt?: AfSeed['plddt'];
}

type Node = { type: string; props: Record<string, unknown> };

function h(type: string, style: Record<string, unknown>, children?: unknown): Node {
  return { type, props: { style, children } };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function plddtBar(p: NonNullable<AfSeed['plddt']>): Node {
  const segs = [
    { w: p.veryHigh, c: C.veryHigh, label: 'Very high' },
    { w: p.confident, c: C.confident, label: 'Confident' },
    { w: p.low, c: C.low, label: 'Low' },
    { w: p.veryLow, c: C.veryLow, label: 'Very low' },
  ];
  return h('div', { display: 'flex', flexDirection: 'column', gap: 12 }, [
    h('div', { display: 'flex', fontSize: 26, color: C.muted }, `Model confidence · mean pLDDT ${p.mean.toFixed(1)}`),
    h(
      'div',
      { display: 'flex', width: 1040, height: 28, borderRadius: 14, overflow: 'hidden', backgroundColor: C.panel },
      segs.filter((s) => s.w > 0.002).map((s) => h('div', { display: 'flex', width: Math.round(s.w * 1040), height: 28, backgroundColor: s.c }))
    ),
    h(
      'div',
      { display: 'flex', gap: 28, fontSize: 22, color: C.muted },
      segs.map((s) =>
        h('div', { display: 'flex', alignItems: 'center', gap: 8 }, [
          h('div', { display: 'flex', width: 16, height: 16, borderRadius: 8, backgroundColor: s.c }),
          `${s.label} ${Math.round(s.w * 100)}%`,
        ])
      )
    ),
  ]);
}

function cardTree(spec: CardSpec): Node {
  const url = `molviewer.bio/${spec.kind}/${spec.id}`;
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: WIDTH,
      height: HEIGHT,
      padding: '56px 80px',
      backgroundColor: C.bg,
      borderTop: `10px solid ${C.accent}`,
      color: C.text,
      fontFamily: 'Inter',
    },
    [
      h('div', { display: 'flex', alignItems: 'center', gap: 16, fontSize: 30 }, [
        h('div', { display: 'flex', fontWeight: 700, color: C.accent }, 'MolViewer'),
        h('div', { display: 'flex', color: C.muted }, spec.kind === 'pdb' ? 'Protein Data Bank entry' : 'AlphaFold prediction'),
      ]),
      h('div', { display: 'flex', flexDirection: 'column', gap: 14 }, [
        h('div', { display: 'flex', fontSize: 112, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }, spec.id),
        h('div', { display: 'flex', fontSize: 50, fontWeight: 600, lineHeight: 1.15 }, truncate(spec.title, 60)),
        h('div', { display: 'flex', fontSize: 30, color: C.muted }, truncate(spec.subtitle, 80)),
      ]),
      spec.plddt
        ? plddtBar(spec.plddt)
        : h(
            'div',
            { display: 'flex', gap: 12, flexWrap: 'wrap' },
            spec.tags.slice(0, 3).map((t) =>
              h(
                'div',
                { display: 'flex', padding: '8px 18px', borderRadius: 999, border: `2px solid ${C.border}`, backgroundColor: C.panel, fontSize: 24, color: C.muted },
                truncate(t, 40)
              )
            )
          ),
      h('div', { display: 'flex', justifyContent: 'space-between', fontSize: 26, color: C.muted }, [
        h('div', { display: 'flex', color: C.text }, url),
        h('div', { display: 'flex' }, 'Interactive 3D · free · no install'),
      ]),
    ]
  );
}

const require = createRequire(import.meta.url);
function font(weight: 400 | 600 | 700): Buffer {
  return readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`));
}

export function pdbCardSpec(p: PdbSeed, name: string, tags: string[]): CardSpec {
  // Same classification as the page title (methodNoun), so card and page agree.
  const noun = methodNoun(p.method);
  const method = noun === 'structure' ? 'Experimental structure' : noun.charAt(0).toUpperCase() + noun.slice(1);
  const res = p.resolution ? ` · ${formatResolution(p.resolution)} Å` : '';
  return { kind: 'pdb', id: p.id, title: name, subtitle: `${method}${res}`, tags };
}

export function afCardSpec(a: AfSeed): CardSpec {
  const subtitle = [a.gene, a.organism].filter(Boolean).join(' · ');
  return { kind: 'af', id: a.id, title: a.name, subtitle, tags: [], plddt: a.plddt };
}

/**
 * Render cards into `${outDir}/og/{kind}/{id}.png`. Returns how many were
 * rendered vs. reused from `cacheDir`.
 */
export async function renderOgCards(specs: CardSpec[], outDir: string, cacheDir: string): Promise<{ rendered: number; cached: number }> {
  const fonts = [
    { name: 'Inter', data: font(400), weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: font(600), weight: 600 as const, style: 'normal' as const },
    { name: 'Inter', data: font(700), weight: 700 as const, style: 'normal' as const },
  ];
  mkdirSync(cacheDir, { recursive: true });
  let rendered = 0;
  let cached = 0;
  for (const spec of specs) {
    const key = createHash('sha1').update(JSON.stringify({ v: CARD_VERSION, spec })).digest('hex');
    const cacheFile = join(cacheDir, `${key}.png`);
    let png: Buffer;
    if (existsSync(cacheFile)) {
      png = readFileSync(cacheFile);
      cached++;
    } else {
      // satori accepts plain element objects in place of JSX.
      const svg = await satori(cardTree(spec) as unknown as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts });
      png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
      writeFileSync(cacheFile, png);
      rendered++;
    }
    const file = join(outDir, 'og', spec.kind, `${spec.id}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
  }
  return { rendered, cached };
}
