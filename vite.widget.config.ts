/**
 * Second build: the chat app widget (src/widget) into dist/widget/v1/.
 *
 * - `viewer.js` and `viewer.css` keep fixed names: the MCP server's UI
 *   resource (ui://molviewer/viewer-v1.html) refers to them. They get a short
 *   cache lifetime in public/_headers; the hashed chunks under assets/ are immutable.
 * - `base: './'` makes chunk imports resolve against the script's own URL, so
 *   the bundle works when the host's sandbox (another origin) loads it.
 * - Bump v1 -> v2 together with WIDGET_RESOURCE_URI for breaking changes.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // No error reporting from the widget (keeps New Relic out of its CSP and privacy scope).
    'import.meta.env.VITE_NEW_RELIC_LICENSE_KEY': '""',
  },
  build: {
    outDir: 'dist/widget/v1',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    terserOptions: { compress: { drop_console: true, drop_debugger: true } },
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/widget/main.tsx',
      output: {
        format: 'es',
        entryFileNames: 'viewer.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (asset) =>
          asset.names?.some((n) => n.endsWith('.css')) ? 'viewer.css' : 'assets/[name]-[hash][extname]',
        // Same split as the main app. (A finer function-based split created a
        // circular chunk import that crashed at load: keep this simple.)
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
});
