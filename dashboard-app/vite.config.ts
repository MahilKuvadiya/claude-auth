import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA → served from the GCS bucket. Env vars injected at build time (VITE_*).
export default defineConfig({
  base: './', // relative asset paths so it works under the GCS bucket path prefix
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
