import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// pdfjs-dist legacy worker needs to be excluded from optimizeDeps bundling quirks;
// we load the worker via ?url and Worker.
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: ['pdf-lib', 'idb'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
