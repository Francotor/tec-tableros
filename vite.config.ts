import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Base configurable para GitHub Pages: VITE_BASE=/otro-nombre/ npm run build
export default defineConfig({
  base: process.env.VITE_BASE ?? '/tec-tableros/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
