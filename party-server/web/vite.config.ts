import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  appType: 'spa',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/media': 'http://127.0.0.1:8787',
      '/subtitle': 'http://127.0.0.1:8787',
      '/videasy': 'http://127.0.0.1:8787',
      '/extract': 'http://127.0.0.1:8787',
      '/play': 'http://127.0.0.1:8787',
      '/wyzie': 'http://127.0.0.1:8787',
      '/streamflix': 'http://127.0.0.1:8787',
      '/tmdb': 'http://127.0.0.1:8787',
      '/app': 'http://127.0.0.1:8787',
      '/health': 'http://127.0.0.1:8787',
      '/rooms': 'http://127.0.0.1:8787',
      '/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
    },
  },
});
