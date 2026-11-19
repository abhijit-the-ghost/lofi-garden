/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the identical dist/ works on GitHub Pages (/lofi-garden/)
  // and inside itch.io's HTML5 subpath embed.
  base: './',
  plugins: [react()],
  server: { port: 5180 },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
