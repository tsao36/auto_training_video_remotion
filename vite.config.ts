import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Runtime data and Python virtualenvs must not be watched by Vite.
    watch: {
      ignored: [
        '**/.venv/**',
        '**/.venv312/**',
        '**/__pycache__/**',
        '**/dist/**',
        '**/.playwright-mcp/**',
        '**/projects/**',
        '**/output/**',
        '**/public/audio/**',
        '**/public/pptx-media/**',
        '**/voice-samples/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/audio': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/pptx-media': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/output': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
