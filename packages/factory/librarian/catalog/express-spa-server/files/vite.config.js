import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 3000, emptyOutDir: true, outDir: '../dist/web' },
  plugins: [react()],
  root: 'web',
  // `vite` in development forwards API calls to the Express server.
  server: { proxy: { '/api': 'http://localhost:8080', '/health': 'http://localhost:8080' } },
});
