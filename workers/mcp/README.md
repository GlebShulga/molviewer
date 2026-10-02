# MolViewer MCP server (ChatGPT and Claude app)

An MCP server that lets ChatGPT and Claude find molecular structures, answer questions about them, and show them in an interactive 3D viewer inside the chat. Plan and background: `docs/growth/03-chatgpt-app-plan.md`.

```
ChatGPT / Claude ──MCP──▶ mcp.molviewer.bio/mcp   (this Worker: tools + UI resource)
       │                          │
       │ sandboxed iframe         └─▶ RCSB, PDBe, AlphaFold DB, UniProt, PubChem (site/upstream)
       ▼
molviewer.bio/widget/v1/viewer.js  (src/widget, built by vite.widget.config.ts)
       └─▶ files.rcsb.org, alphafold.ebi.ac.uk, pubchem (coordinates never pass through the model)
```

## Pieces

| Where | What |
|---|---|
| `src/index.ts` | Worker entry: `/mcp` (stateless Streamable HTTP), `/.well-known/openai-apps-challenge`, `/health` |
| `src/server.ts` | Tool and resource registration, rate limit, cache and analytics wrapper |
| `src/tools.ts` | `find_structures`, `show_structure`, `get_structure_details` as plain functions |
| `src/catalog.ts` | Search over `data/*.json` (curated PDB, AlphaFold, compounds, collections) |
| `src/safety.ts` | Deny-list of Chemical Weapons Convention Schedule 1 agents (by CID and name) |
| `src/widgetResource.ts` | The `ui://molviewer/viewer-v1.html` resource and its CSP and `_meta` |
| `site/appContract.ts` | Shared with the widget: tool vocabulary and the `_meta["molviewer/widget"]` payload |
| `src/widget/` (repo root) | The viewer that runs in the chat |
| `package/` | Submission package: `plugin.json` (listing, test cases), `mcp.json`; `pnpm package:app` adds the logo and zips it |
| `dev-host/` | A minimal MCP Apps host for trying the widget locally |

The SDK is `@modelcontextprotocol/server` 2.x with `@modelcontextprotocol/ext-apps`. Under wrangler's `workerd` export condition the SDK picks its Cloudflare-safe JSON schema validator automatically (no `eval`), so nothing needs configuring.

## Local development

Three terminals:

```sh
pnpm build && pnpm pages:preview   # site + widget bundle on http://localhost:8788
pnpm mcp:dev                       # MCP server on http://localhost:8787/mcp (widget assets from :8788)
pnpm mcp:host                      # test host on http://localhost:8790
```

The test host calls a tool, renders the UI resource in a sandboxed iframe with an opaque origin and the resource's CSP, as ChatGPT and Claude do, and logs open-link and display-mode requests. Example: `http://localhost:8790/?auto=1&tool=show_structure&args={"kind":"alphafold","id":"P04637"}&dark=1`.

To try it in ChatGPT before deploying, expose port 8787 with a tunnel (for example `cloudflared tunnel --url http://localhost:8787`) and add `<tunnel>/mcp` as a connector in ChatGPT developer mode. The widget assets must also be reachable from the internet then: point `WIDGET_ASSET_ORIGIN` at a Pages preview deployment.

Tests run with the rest of the suite (`pnpm test:run`): tool logic on the recorded upstream fixtures, and a full MCP round trip through the real handler with the SDK client. Re-record the search fixtures with `pnpm exec tsx site/upstream/__fixtures__/record.ts --search`.

## Deploying

One-time setup:

1. **Workers Paid plan** ($5/month). The free plan's 100k requests/day are shared by the site's Functions and this Worker.
2. Deploy: `pnpm mcp:deploy`. The `routes` entry in `wrangler.toml` creates the `mcp.molviewer.bio` custom domain (DNS record and certificate) on first deploy.
3. Check: `curl https://mcp.molviewer.bio/health`.

The widget bundle ships with the site (`pnpm build` writes `dist/widget/v1/`), so deploy the Pages site first whenever the widget changes. `public/_headers` gives `/widget/*` CORS and cache headers; `public/_routes.json` keeps it out of Functions.

**The MCP URL `https://mcp.molviewer.bio/mcp` can't change after submission.** Keep the hostname and path stable.

### Changing the widget

- Fixes and additions: just deploy the site. `viewer.js` and `viewer.css` are cached for 5 minutes, hashed chunks forever.
- Breaking changes to the payload or the resource HTML: bump `WIDGET_RESOURCE_URI` (`-v2`), `WIDGET_ASSET_PATH` (`/widget/v2`) and the outDir in `vite.widget.config.ts` together. Hosts cache the resource by its URI.

## Submitting to OpenAI

1. **Verify your identity** on the OpenAI platform (publisher shown as Gleb Shulga).
2. `pnpm package:app` writes `dist-app/molviewer-app.zip` (plugin.json, mcp.json, logo). It checks the listing limits first.
3. In the dashboard: upload the ZIP and connect the MCP server.
4. **Domain verification:** the dashboard gives a token. Store it and redeploy:
   `pnpm wrangler secret put OPENAI_APPS_CHALLENGE -c workers/mcp/wrangler.toml`
   It's then served at `https://mcp.molviewer.bio/.well-known/openai-apps-challenge`.
5. Add screenshots (optional) and a 2-3 minute **demo video** showing the 8 test cases in ChatGPT.
6. Run the scan, fix anything it reports, and submit.

Server changes go live after OpenAI's daily rescan if they pass the automatic checks. Listing changes (descriptions, test cases) need a new ZIP.

For Claude: add `https://mcp.molviewer.bio/mcp` as a custom connector; the same server and widget work there. Submitting to Anthropic's connector directory is a separate later step.

## Operations

- **Rate limits** (`wrangler.toml`, `src/rateLimit.ts`): 600 tool calls/min per connecting IP on every call (a chat provider's users share its few IPs; this mainly caps one abusive client), 30/min per ChatGPT user (`openai/subject`) when one is sent, and about 3,000/min overall. Claude sends no user id, so all Claude users together share the per-IP allowance of Anthropic's servers: watch `rate_limited` outcomes in `query-events.ts --app` and raise `IP_LIMIT` if they appear. The overall limit is counted per Cloudflare location, so it's approximate.
- **Caching:** tool results for 24 h in the Cache API (`src/cache.ts`); upstream responses are edge-cached too. Bump `CACHE_VERSION` when result shapes change.
- **Analytics:** `mcp_tool_call` points (tool, kind, client, outcome, seconds; never search text or IDs) go to the site's `molviewer_events` dataset, and the widget sends `widget_view` / `widget_open_full`. Summary: `pnpm exec tsx scripts/query-events.ts --app 30`.
- **Logs:** Workers observability is enabled; tail live with `pnpm wrangler tail -c workers/mcp/wrangler.toml`.
