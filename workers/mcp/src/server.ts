/**
 * MCP server definition: three read-only tools and the widget resource.
 * A fresh instance is built per request (stateless serving, see index.ts).
 */
import { McpServer, type CallToolResult, type ServerContext } from '@modelcontextprotocol/server';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import * as z from 'zod/v4';
import { APP_COLORS, APP_STYLES, WIDGET_RESOURCE_URI, type AppKind } from '../../../site/appContract';
import { SITE_ORIGIN } from '../../../site/nav';
import type { UpstreamOptions } from '../../../site/upstream/types';
import { findStructures, getStructureDetails, showStructure, type ToolOutcome } from './tools';
import { widgetHtml, widgetResourceMeta } from './widgetResource';
import { clientOf, limitCaller, RATE_LIMITED_MESSAGE } from './rateLimit';
import { cachedOutcome } from './cache';
import { recordToolCall } from './analytics';

export interface Env {
  EVENTS?: AnalyticsEngineDataset;
  /** Per connecting IP, on every call (see rateLimit.ts). */
  IP_LIMIT?: RateLimit;
  /** Per ChatGPT user (openai/subject), when one is sent. */
  USER_LIMIT?: RateLimit;
  /** Approximate global backstop: counted per Cloudflare location. */
  GLOBAL_LIMIT?: RateLimit;
  /** Token for /.well-known/openai-apps-challenge (a secret). */
  OPENAI_APPS_CHALLENGE?: string;
  /** Origin serving /widget/v1/ assets. Defaults to https://molviewer.bio. */
  WIDGET_ASSET_ORIGIN?: string;
  /** ChatGPT's dedicated widget origin (`openai/widgetDomain`). */
  CHATGPT_WIDGET_DOMAIN?: string;
}

export const SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = `MolViewer shows public molecular structures in interactive 3D: PDB entries, AlphaFold DB models and PubChem small molecules.
- To display a structure, call show_structure. If you only have a name, call find_structures first, unless you already know the exact PDB ID, UniProt accession or compound name.
- After show_structure, always answer in text too: a few sentences on what the structure is, from the facts the tool returns. The viewer shows only the picture.
- For factual questions about a PDB entry, AlphaFold model or compound (method, resolution, authors and citation, chains, ligands, helix and strand ranges, confidence) call get_structure_details; it reads the source databases directly and doesn't open the viewer.
- Citation authors come as surname and initials ("Teeter, M.M."). Keep them that way: never expand initials into first names.
- MolViewer is for looking at structures. It never gives synthesis routes, doses or acquisition advice, and it refuses chemical warfare agents.`;

const kindSchema = z.enum(['pdb', 'alphafold', 'compound']);
const idDescription =
  'PDB ID (e.g. "4HHB") for pdb, UniProt accession (e.g. "P04637") for alphafold, or compound name, slug or PubChem CID (e.g. "caffeine", "2519") for compound.';

const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true } as const;

const foundSchema = z.object({
  kind: kindSchema,
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  why: z.string(),
  pageUrl: z.string(),
});

/** Fields every structure summary may carry; kinds add their own (loose object). */
const summarySchema = z.looseObject({
  kind: kindSchema,
  id: z.string().optional().describe('PDB ID or UniProt accession'),
  cid: z.number().optional().describe('PubChem CID (compounds)'),
  name: z.string().optional(),
  title: z.string().optional(),
  protein: z.string().optional(),
  method: z.string().optional(),
  resolutionAngstrom: z.number().optional(),
  organisms: z.array(z.string()).optional(),
  organism: z.string().optional(),
  meanPlddt: z.number().optional(),
  formula: z.string().optional(),
  citation: z.string().optional(),
  pageUrl: z.string(),
  note: z.string().optional(),
});

function toResult(o: ToolOutcome): CallToolResult {
  return {
    content: [...(o.lead ? [{ type: 'text' as const, text: o.lead }] : []), { type: 'text', text: o.text }],
    ...(o.structuredContent ? { structuredContent: o.structuredContent } : {}),
    ...(o.meta ? { _meta: o.meta } : {}),
    ...(o.isError ? { isError: true } : {}),
  };
}

/** `upstream` lets tests inject recorded fixtures (site/upstream/__fixtures__). */
export function createServer(
  env: Env,
  waitUntil: (p: Promise<unknown>) => void = () => {},
  upstream: UpstreamOptions = {}
): McpServer {
  const server = new McpServer({ name: 'molviewer', version: SERVER_VERSION, title: 'MolViewer' }, { instructions: INSTRUCTIONS });
  const assetOrigin = env.WIDGET_ASSET_ORIGIN || SITE_ORIGIN;

  /** Rate limit, cache, run and record one tool call. */
  async function run(tool: string, kind: AppKind | 'any', args: unknown, ctx: ServerContext, fn: () => Promise<ToolOutcome>) {
    const started = Date.now();
    const client = clientOf(ctx);
    let outcome: ToolOutcome;
    if (!(await limitCaller(env, ctx))) {
      outcome = { text: RATE_LIMITED_MESSAGE, isError: true, status: 'invalid' };
      recordToolCall(env, { tool, kind, client, status: 'rate_limited', ms: Date.now() - started });
      return toResult(outcome);
    }
    try {
      outcome = await cachedOutcome(tool, args, fn, waitUntil);
    } catch (err) {
      console.error(`${tool} failed`, err);
      outcome = { text: 'MolViewer hit an unexpected error. Please try again.', isError: true, status: 'upstream_error' };
    }
    recordToolCall(env, { tool, kind, client, status: outcome.status, ms: Date.now() - started });
    return toResult(outcome);
  }

  server.registerTool(
    'find_structures',
    {
      title: 'Find structures',
      description:
        'Search for molecular structures by name and get their IDs: proteins and nucleic acids in the PDB, AlphaFold predicted models, and small molecules in PubChem. ' +
        'Use it for requests like "hemoglobin", "insulin hexamer", "caffeine" or "human p53 AlphaFold". ' +
        'Curated MolViewer catalogs are searched first, then RCSB, UniProt and PubChem. Returns IDs to pass to show_structure or get_structure_details, ' +
        'best match first: the first result is the canonical, complete structure, so prefer it unless the user asked for a specific state, variant or organism.',
      inputSchema: z.object({
        query: z.string().min(1).max(200).describe('Name of a protein, nucleic acid, compound or topic, e.g. "hemoglobin".'),
        kind: z
          .enum(['pdb', 'alphafold', 'compound', 'any'])
          .optional()
          .describe('Limit to one database. "alphafold" searches proteins with AlphaFold models. Default: any.'),
        limit: z.number().int().min(1).max(10).optional().describe('Maximum results (1-10, default 5).'),
      }),
      outputSchema: z.object({ query: z.string(), results: z.array(foundSchema) }),
      annotations: ANNOTATIONS,
    },
    (args, ctx) => run('find_structures', args.kind ?? 'any', args, ctx, () => findStructures(args, upstream))
  );

  registerAppTool(
    server,
    'show_structure',
    {
      title: 'Show structure in 3D',
      description:
        'Display a molecular structure in an interactive 3D viewer the user can rotate and zoom: a PDB entry, an AlphaFold DB model, or a PubChem compound. ' +
        'Use it when the user wants to see, show, visualize or look at a structure, or asks what a molecule looks like. ' +
        'Returns key facts (method, resolution, chains, ligands; or pLDDT confidence; or formula) to explain alongside the viewer. ' +
        'The viewer shows the chains in the entry file (polymerChainCount); if a note says the file is only part of the biological assembly, describe what is shown accordingly. ' +
        'Defaults: cartoon colored by chain for PDB, cartoon colored by confidence for AlphaFold, ball and stick for compounds. ' +
        'Only for visualization: never provide synthesis routes, doses or acquisition advice.',
      inputSchema: z.object({
        kind: kindSchema.describe('pdb, alphafold or compound.'),
        id: z.string().min(1).max(100).describe(idDescription),
        style: z
          .enum(APP_STYLES)
          .optional()
          .describe('cartoon (proteins, nucleic acids), ball-and-stick, stick, spacefill or surface (molecular surface).'),
        color: z
          .enum(APP_COLORS)
          .optional()
          .describe(
            'secondaryStructure, chain, cpk (by element), residueType, bfactor, confidence (AlphaFold pLDDT in the standard AlphaFold DB colors; AlphaFold only) or rainbow (N to C terminus).'
          ),
        spin: z.boolean().optional().describe('Slowly rotate the structure.'),
      }),
      outputSchema: summarySchema.extend({ shown: z.object({ style: z.enum(APP_STYLES), color: z.enum(APP_COLORS) }) }),
      annotations: ANNOTATIONS,
      _meta: { ui: { resourceUri: WIDGET_RESOURCE_URI }, 'openai/outputTemplate': WIDGET_RESOURCE_URI },
    },
    (args, ctx) => run('show_structure', args.kind, args, ctx, () => showStructure(args, upstream))
  );

  server.registerTool(
    'get_structure_details',
    {
      title: 'Get structure details',
      description:
        'Facts about a PDB entry, AlphaFold model or compound without opening the viewer, straight from RCSB PDB, PDBe, AlphaFold DB, UniProt and PubChem: ' +
        'experimental method, resolution, release year, authors and citation, organism, chains, ligands, helix and beta-strand residue ranges per chain, sequences and related entries for PDB; ' +
        'function, confidence and experimental structures for AlphaFold. Use it for questions like "what is the resolution of 1CRN and who published it?" or "which residues form the beta sheets in 3DNI?". ' +
        'Citation authors are surname and initials; keep them as given.',
      inputSchema: z.object({
        kind: kindSchema.describe('pdb, alphafold or compound.'),
        id: z.string().min(1).max(100).describe(idDescription),
        sections: z
          .array(z.enum(['secondaryStructure', 'sequence', 'ligands', 'citation', 'related']))
          .optional()
          .describe('Which extra sections to include. Default: secondaryStructure, ligands, citation. Sequences are long; ask only when needed.'),
      }),
      outputSchema: summarySchema,
      annotations: ANNOTATIONS,
    },
    (args, ctx) => run('get_structure_details', args.kind, args, ctx, () => getStructureDetails(args, upstream))
  );

  const resourceOptions = { assetOrigin, chatgptWidgetDomain: env.CHATGPT_WIDGET_DOMAIN || SITE_ORIGIN };
  registerAppResource(
    server,
    'MolViewer 3D viewer',
    WIDGET_RESOURCE_URI,
    { description: 'Interactive 3D molecular viewer', _meta: widgetResourceMeta(resourceOptions) },
    async () => ({
      contents: [
        {
          uri: WIDGET_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml(resourceOptions),
          _meta: widgetResourceMeta(resourceOptions),
        },
      ],
    })
  );

  return server;
}
