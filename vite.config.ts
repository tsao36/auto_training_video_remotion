import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three-vendor';
          if (id.includes('node_modules/@remotion') || id.includes('node_modules/remotion')) return 'remotion-vendor';
          if (id.includes('node_modules/jszip')) return 'zip-vendor';
          if (id.includes('node_modules/react')) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: process.env.HOST || '127.0.0.1',
    open: process.env.OPEN === 'true',
    ...(port ? { port } : {}),
    strictPort: process.env.STRICT_PORT === 'true',
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
      '/music': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/imported': {
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
