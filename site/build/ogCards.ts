/**
 * Social preview cards (1200x630 PNG) for the PDB, AlphaFold and compound
 * entries in the sitemap, rendered at build time with satori + resvg into
 * dist/og/.
 *
 * Why build time: rendering takes far more CPU than the 10 ms a free-plan
 * Pages Function gets per request, and the bundle would grow by ~700 KB.
 * Cards use only our own data (no third-party images), so they're small,
 * deterministic and cacheable. Unchanged cards are reused from a local cache.
 *
 * Each card shows a picture of the molecule (site/moleculeArt.ts, from the
 * committed geometry in data/og-art/) next to the text. Entries without
 * geometry get the text-only card.
 *
 * PNGs are palette-quantized with sharp: shaded spheres make full-color
 * cards 200-350 KB, and WhatsApp drops previews over about 300 KB.
 *
 * Colors here are image pixels, not page CSS; they mirror the dark theme
 * tokens in src/index.css.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { AfSeed, Compound, PdbSeed } from '../dataTypes';
import { COMPOUND_CATEGORY_LABELS } from '../dataTypes';
import { formatResolution, methodNoun } from '../render/format';
import { afArtSvg, ballStickSvg, pdbArtSvg, type BallStickArt, type BeadArt } from '../moleculeArt';
import { SQUARE_FALLBACK } from '../ogImages';
import { mapLimit } from '../../scripts/lib/http';

const WIDTH = 1200;
const HEIGHT = 630;
const ART_SIZE = 520;

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

export type CardKind = 'pdb' | 'af' | 'compound';

export interface CardSpec {
  kind: CardKind;
  /** File name and address: PDB ID, UniProt accession or compound slug. */
  id: string;
  /** Large text; defaults to `id` (compounds show their name). */
  heading?: string;
  title: string;
  subtitle: string;
  tags: string[];
  plddt?: AfSeed['plddt'];
  /** SVG picture of the molecule. Part of the spec, so new art changes the cache key. */
  art?: string;
}

const KIND_LABEL: Record<CardKind, string> = {
  pdb: 'Protein Data Bank entry',
  af: 'AlphaFold prediction',
  compound: 'Small molecule',
};

type Node = { type: string; props: Record<string, unknown> };

function h(type: string, style: Record<string, unknown>, children?: unknown): Node {
  return { type, props: { style, children } };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function plddtBar(p: NonNullable<AfSeed['plddt']>, width: number, compact: boolean): Node {
  const segs = [
    { w: p.veryHigh, c: C.veryHigh, label: 'Very high' },
    { w: p.confident, c: C.confident, label: 'Confident' },
    { w: p.low, c: C.low, label: 'Low' },
    { w: p.veryLow, c: C.veryLow, label: 'Very low' },
  ];
  return h('div', { display: 'flex', flexDirection: 'column', gap: compact ? 10 : 12 }, [
    h('div', { display: 'flex', fontSize: compact ? 22 : 26, color: C.muted }, `Model confidence · mean pLDDT ${p.mean.toFixed(1)}`),
    h(
      'div',
      { display: 'flex', width, height: compact ? 22 : 28, borderRadius: 14, overflow: 'hidden', backgroundColor: C.panel },
      segs.filter((s) => s.w > 0.002).map((s) => h('div', { display: 'flex', width: Math.round(s.w * width), height: compact ? 22 : 28, backgroundColor: s.c }))
    ),
    h(
      'div',
      { display: 'flex', flexWrap: 'wrap', gap: compact ? '6px 18px' : 28, fontSize: compact ? 19 : 22, color: C.muted },
      segs.map((s) =>
        h('div', { display: 'flex', alignItems: 'center', gap: 8 }, [
          h('div', { display: 'flex', width: 16, height: 16, borderRadius: 8, backgroundColor: s.c }),
          `${s.label} ${Math.round(s.w * 100)}%`,
        ])
      )
    ),
  ]);
}

function tagRow(tags: string[], compact: boolean): Node {
  return h(
    'div',
    { display: 'flex', gap: compact ? 10 : 12, flexWrap: 'wrap' },
    tags.slice(0, 3).map((t) =>
      h(
        'div',
        {
          display: 'flex',
          padding: compact ? '6px 14px' : '8px 18px',
          borderRadius: 999,
          border: `2px solid ${C.border}`,
          backgroundColor: C.panel,
          fontSize: compact ? 20 : 24,
          color: C.muted,
        },
        truncate(t, compact ? 30 : 40)
      )
    )
  );
}

function header(spec: CardSpec, fontSize: number): Node {
  return h('div', { display: 'flex', alignItems: 'center', gap: 16, fontSize }, [
    h('div', { display: 'flex', fontWeight: 700, color: C.accent }, 'MolViewer'),
    h('div', { display: 'flex', color: C.muted }, KIND_LABEL[spec.kind]),
  ]);
}

const pageUrl = (spec: CardSpec) => `molviewer.bio/${spec.kind}/${spec.id}`;

/** The original full-width card, for entries without a picture. */
function textCardTree(spec: CardSpec): Node {
  const heading = spec.heading ?? spec.id;
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
      header(spec, 30),
      h('div', { display: 'flex', flexDirection: 'column', gap: 14 }, [
        h('div', { display: 'flex', fontSize: heading.length > 12 ? 80 : 112, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }, truncate(heading, 30)),
        h('div', { display: 'flex', fontSize: 50, fontWeight: 600, lineHeight: 1.15 }, truncate(spec.title, 60)),
        h('div', { display: 'flex', fontSize: 30, color: C.muted }, truncate(spec.subtitle, 80)),
      ]),
      spec.plddt ? plddtBar(spec.plddt, 1040, false) : tagRow(spec.tags, false),
      h('div', { display: 'flex', justifyContent: 'space-between', fontSize: 26, color: C.muted }, [
        h('div', { display: 'flex', color: C.text }, pageUrl(spec)),
        h('div', { display: 'flex' }, 'Interactive 3D · free · no install'),
      ]),
    ]
  );
}

/** Font size that fits the heading on one or two lines of the text column. */
function headingSize(heading: string): number {
  if (heading.length <= 6) return 104;
  if (heading.length <= 10) return 80;
  if (heading.length <= 16) return 60;
  return 48;
}

/** Text column on the left, the molecule on the right. */
function artCardTree(spec: CardSpec, art: string): Node {
  const padX = 56;
  const gap = 32;
  const textWidth = WIDTH - 2 * padX - gap - ART_SIZE;
  const heading = spec.heading ?? spec.id;
  return h(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      gap,
      width: WIDTH,
      height: HEIGHT,
      padding: `0 ${padX}px`,
      backgroundColor: C.bg,
      borderTop: `10px solid ${C.accent}`,
      color: C.text,
      fontFamily: 'Inter',
    },
    [
      h(
        'div',
        { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: textWidth, height: HEIGHT - 10 - 96 },
        [
          header(spec, 26),
          h('div', { display: 'flex', flexDirection: 'column', gap: 12 }, [
            h('div', { display: 'flex', fontSize: headingSize(heading), fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }, truncate(heading, 36)),
            spec.title ? h('div', { display: 'flex', fontSize: 38, fontWeight: 600, lineHeight: 1.15 }, truncate(spec.title, 64)) : null,
            h('div', { display: 'flex', fontSize: 26, color: C.muted, lineHeight: 1.25 }, truncate(spec.subtitle, 70)),
          ].filter(Boolean)),
          spec.plddt ? plddtBar(spec.plddt, textWidth, true) : tagRow(spec.tags, true),
          h('div', { display: 'flex', flexDirection: 'column', gap: 4 }, [
            h('div', { display: 'flex', fontSize: 24, color: C.text }, pageUrl(spec)),
            h('div', { display: 'flex', fontSize: 20, color: C.muted }, 'Interactive 3D · free · no install'),
          ]),
        ]
      ),
      {
        type: 'img',
        props: {
          src: `data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}`,
          width: ART_SIZE,
          height: ART_SIZE,
          style: { display: 'flex' },
        },
      },
    ]
  );
}

export function cardTree(spec: CardSpec): Node {
  return spec.art ? artCardTree(spec, spec.art) : textCardTree(spec);
}

const require = createRequire(import.meta.url);
function font(weight: 400 | 600 | 700): Buffer {
  return readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`));
}

export function pdbCardSpec(p: PdbSeed, name: string, tags: string[], art?: BeadArt): CardSpec {
  // Same classification as the page title (methodNoun), so card and page agree.
  const noun = methodNoun(p.method);
  const method = noun === 'structure' ? 'Experimental structure' : noun.charAt(0).toUpperCase() + noun.slice(1);
  const res = p.resolution ? ` · ${formatResolution(p.resolution)} Å` : '';
  const svg = art ? pdbArtSvg(art, C.bg, ART_SIZE) : null;
  return { kind: 'pdb', id: p.id, title: name, subtitle: `${method}${res}`, tags, ...(svg ? { art: svg } : {}) };
}

export function afCardSpec(a: AfSeed, art?: BeadArt): CardSpec {
  const subtitle = [a.gene, a.organism].filter(Boolean).join(' · ');
  const svg = art ? afArtSvg(art, C.bg, ART_SIZE) : null;
  return { kind: 'af', id: a.id, title: a.name, subtitle, tags: [], plddt: a.plddt, ...(svg ? { art: svg } : {}) };
}

export function compoundCardSpec(c: Compound, art?: BallStickArt): CardSpec {
  const svg = art ? ballStickSvg(art, C.muted, ART_SIZE) : null;
  return {
    kind: 'compound',
    id: c.slug,
    heading: c.name,
    title: c.formula,
    subtitle: `${COMPOUND_CATEGORY_LABELS[c.category]} · ${c.weight} g/mol`,
    tags: [],
    ...(svg ? { art: svg } : {}),
  };
}

/**
 * Everything besides the spec that changes the rendered PNG: this file (layout,
 * colors, encoder settings) and the versions of the renderers and fonts. No
 * manual version to forget, and a CI cache restored from an older run can't
 * hand back cards drawn by older code.
 */
const RENDERER = createHash('sha1')
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .update(['satori', '@resvg/resvg-js', 'sharp', '@fontsource/inter'].map((p) => `${p}@${require(`${p}/package.json`).version}`).join())
  .digest('hex');

/** Cache key: the rendered PNG depends only on the renderer and the spec (art included). */
export function cardKey(spec: CardSpec): string {
  return createHash('sha1').update(JSON.stringify({ renderer: RENDERER, spec })).digest('hex');
}

function fonts() {
  return ([400, 600, 700] as const).map((weight) => ({ name: 'Inter', data: font(weight), weight, style: 'normal' as const }));
}

/**
 * Square stand-in for PDB entries without a card when RCSB has no image
 * (functions/api/og/[source]/[id].png.ts). Those pages announce a 500x500 JPEG
 * and the small Twitter card, so the fallback must be one too.
 */
export async function renderSquareFallback(outDir: string): Promise<void> {
  const tree = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 16,
      width: SQUARE_FALLBACK.width,
      height: SQUARE_FALLBACK.height,
      padding: 48,
      backgroundColor: C.bg,
      borderTop: `10px solid ${C.accent}`,
      color: C.text,
      fontFamily: 'Inter',
    },
    [
      h('div', { display: 'flex', fontSize: 64, fontWeight: 700, color: C.accent }, 'MolViewer'),
      h('div', { display: 'flex', fontSize: 34, fontWeight: 600, lineHeight: 1.2 }, 'Protein Data Bank entry in 3D'),
      h('div', { display: 'flex', fontSize: 26, color: C.muted }, 'Interactive · free · no install'),
    ]
  );
  const { width, height } = SQUARE_FALLBACK;
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts: fonts() });
  const image = await renderAsync(svg, { fitTo: { mode: 'width', value: width } });
  const jpeg = await sharp(image.pixels, { raw: { width: image.width, height: image.height, channels: 4 } }).jpeg({ quality: 85 }).toBuffer();
  const file = join(outDir, SQUARE_FALLBACK.path.slice(1));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, jpeg);
}

/**
 * Render cards into `${outDir}/og/{kind}/{id}.png`. Returns how many were
 * rendered vs. reused from `cacheDir`.
 */
export async function renderOgCards(specs: CardSpec[], outDir: string, cacheDir: string): Promise<{ rendered: number; cached: number }> {
  const cardFonts = fonts();
  mkdirSync(cacheDir, { recursive: true });
  let rendered = 0;
  let cached = 0;
  const used = new Set<string>();
  const renderOne = async (spec: CardSpec) => {
    const cacheName = `${cardKey(spec)}.png`;
    used.add(cacheName);
    const cacheFile = join(cacheDir, cacheName);
    let png: Buffer;
    if (existsSync(cacheFile)) {
      png = readFileSync(cacheFile);
      cached++;
    } else {
      // satori accepts plain element objects in place of JSX.
      const svg = await satori(cardTree(spec) as unknown as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts: cardFonts });
      const image = await renderAsync(svg, { fitTo: { mode: 'width', value: WIDTH } });
      png = await sharp(image.pixels, { raw: { width: image.width, height: image.height, channels: 4 } })
        .png({ palette: true, quality: 90, effort: 4, compressionLevel: 9 })
        .toBuffer();
      writeFileSync(cacheFile, png);
      rendered++;
    }
    const file = join(outDir, 'og', spec.kind, `${spec.id}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
  };
  // resvg's renderAsync and sharp run on the libuv thread pool, so a few cards
  // in flight use several cores (a cold build renders ~1,550 cards).
  await mapLimit(specs, Math.max(2, Math.min(8, availableParallelism())), renderOne);
  // Drop cards no spec uses any more, so the cache (kept between CI runs) stays bounded.
  for (const name of readdirSync(cacheDir)) if (!used.has(name)) rmSync(join(cacheDir, name));
  return { rendered, cached };
}
