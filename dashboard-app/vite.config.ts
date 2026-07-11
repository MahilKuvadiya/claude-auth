import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA → served from the GCS bucket. Env vars injected at build time (VITE_*).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
