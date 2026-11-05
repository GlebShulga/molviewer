---
name: verify
description: How to verify MolViewer changes at runtime - the site (Pages), the chat widget (src/widget) and the MCP server (workers/mcp), locally or against production.
---

# Verifying MolViewer

Windows machine: use `curl --ssl-no-revoke` (schannel revocation checks fail otherwise). Playwright scripts must live inside the repo (e.g. `node_modules/.cache/`) to resolve `@playwright/test`. Launch Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL.

## Local

```sh
pnpm build && npx wrangler pages dev dist --port 8788   # site + widget bundle
npx wrangler dev -c workers/mcp/wrangler.toml --env dev --port 8787   # MCP, widget assets from :8788
npx vite workers/mcp/dev-host --port 8790 --strictPort  # MCP Apps test host
```

- Widget: open `http://localhost:8790/?auto=1&tool=show_structure&args={"kind":"pdb","id":"4HHB"}` (add `&dark=1`). The host logs `widget initialized`, `open-link ...`, `display-mode ...`. Wait for `canvas` inside `#frame`, then screenshot.
- MCP over JSON-RPC: POST `http://localhost:8787/mcp` with headers `content-type: application/json`, `accept: application/json,text/event-stream`, `mcp-protocol-version: 2025-06-18`. The legacy path answers as SSE (`data: {...}` line). A GET to /mcp returning 405 is normal (stateless).
- Background `wrangler`/`vite` leave `workerd.exe`/`node.exe` listening after the task is stopped: find them with `netstat -ano | grep LISTENING` and `taskkill //PID <pid> //T //F`.

## Production

- Widget assets: `curl -I https://molviewer.bio/widget/v1/viewer.js` needs `Access-Control-Allow-Origin: *`.
- Production widget without deploying the Worker: `wrangler dev -c workers/mcp/wrangler.toml --env="" --port 8787` (top-level vars point assets at https://molviewer.bio), then the dev host as above. This sends one real `widget_view` event (ref `molviewer-dev-host`).
- `/api/event`: probe only with requests that are rejected (cross-origin site event -> 403, unknown event -> 400) to keep analytics clean.

## Gotchas seen

- The custom domain raises `Cache-Control` to `max-age=14400` (zone Browser Cache TTL); `molviewer.pages.dev` shows what `public/_headers` sets.
- Cloudflare Email Obfuscation rewrites `support@molviewer.bio` links to `/cdn-cgi/l/email-protection#...`.
- `/widget/*` is excluded from Functions; `public/widget/404.html` makes missing files there a real 404 (before it, they got the SPA shell with 200).
- On touch screens (`(pointer: coarse)`), Ball & Stick and Stick are disabled for structures with a backbone over 1,000 atoms (`src/utils/representationAvailability.ts`), in the toolbar, the sheet and the widget's Style dropdown, with a visible reason. `?repr=`, keys 1/2, saved and shared sessions fall back to Cartoon. Desktop has no atom limit. To check it, emulate a phone (Playwright `devices['Pixel 5']` turns `pointer: coarse` on; assert it first) and load 4HHB.
- Ctrl+Z right after a page load undoes the load itself (empty panel), on production too.
- The full representations e2e suite can flake on RE-10 (it fetches 1CRN from RCSB); rerun it alone with `-g "RE-10"`.
- In this repo's Windows checkout, files often have CRLF endings: `node -e` string replacements miss; use the Edit tool.
