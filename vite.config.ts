/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://imachickenface.github.io/fitness-quest/
const base = '/fitness-quest/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // icons are generated from public/icon.svg by pwa-assets.config.ts and injected into the manifest
      pwaAssets: { config: true },
      manifest: {
        name: 'Fitness Quest',
        short_name: 'FitQuest',
        description: 'Log food and workouts, complete quests, level up.',
        lang: 'en',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14162b',
        theme_color: '#14162b',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2,json}'],
        // the bundled USDA food list (public/foods.json) must be precached for offline search
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // the barcode polyfill's decoder: only phones without a native BarcodeDetector need it
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'wasm' },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
