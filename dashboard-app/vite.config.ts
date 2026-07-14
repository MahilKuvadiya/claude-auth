import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Static SPA → served from the GCS bucket. Env vars injected at build time (VITE_*).
export default defineConfig({
  base: './', // relative asset paths so it works under the GCS bucket path prefix
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { outDir: 'dist', sourcemap: false },
});
