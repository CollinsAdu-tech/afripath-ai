/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser talks to one origin: /v1/* and /health are forwarded to the engine API,
// so no CORS setup is needed in development or preview. Point at another engine with API_URL.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080';
const proxy = { '/v1': { target: API_URL, changeOrigin: false }, '/health': { target: API_URL, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.WEB_PORT ?? 5173), strictPort: false, proxy },
  preview: { port: Number(process.env.WEB_PORT ?? 4173), proxy },
  build: { sourcemap: false, target: 'es2022' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    server: { deps: { inline: [/react-router/] } },
  },
});
