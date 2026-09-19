import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base configurable para GitHub Pages: VITE_BASE=/otro-nombre/ npm run build
const base = process.env.VITE_BASE ?? '/tec-tableros/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo_tec.png', 'icons/*.png'],
      manifest: {
        name: 'TEC Tableros',
        short_name: 'Tableros',
        description: 'Editor visual de tableros eléctricos con lista de materiales.',
        lang: 'es-CL',
        display: 'standalone',
        theme_color: '#052144',
        background_color: '#ffffff',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo lo que la app necesita sin conexión: código, biblioteca (json, svg, lineales.js) e iconos.
        globPatterns: ['**/*.{js,css,html,svg,png,json,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
