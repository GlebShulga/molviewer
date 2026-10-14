import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sitePlugin } from './site/build/vitePlugin';

export default defineConfig(({ mode }) => ({
  plugins: [react(), sitePlugin()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: mode === 'development',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Rollup puts a manual chunk's unassigned dependencies into that chunk.
        // react/jsx-runtime, zustand and Vite's preload helper are dependencies
        // of @react-three/*, so unless they are assigned here they land in
        // three-vendor, and the startup chunk has to load all of three.js to
        // render anything. three.js itself loads lazily with the viewer.
        manualChunks(id) {
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/.test(id) ||
            id.includes('vite/preload-helper') ||
            id.includes('commonjsHelpers')
          ) {
            return 'react-vendor';
          }
          if (/[\\/]node_modules[\\/](three|three-stdlib|@react-three[\\/](fiber|drei))[\\/]/.test(id)) return 'three-vendor';
        },
      },
    },
  },
}));
