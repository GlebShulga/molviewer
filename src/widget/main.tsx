/**
 * Entry of the chat widget bundle (vite.widget.config.ts), served from
 * molviewer.bio/widget/v1/ and loaded by the MCP server's UI resource
 * (workers/mcp/src/widgetResource.ts) inside the host's sandboxed iframe.
 * No error reporter here: New Relic stays out of the widget.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureTracking } from '../utils/track';
import { connectHost } from './bridge';
import WidgetApp from './WidgetApp';
import '../index.css';
import '../styles/globals.css';

// Events go to the site that served this bundle: molviewer.bio in production,
// the local Pages preview when testing (so tests never reach production analytics).
configureTracking({ endpoint: new URL('/api/event', import.meta.url).href, page: 'widget' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WidgetApp host={connectHost()} />
  </StrictMode>
);
