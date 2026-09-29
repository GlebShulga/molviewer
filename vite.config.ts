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
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
}));
