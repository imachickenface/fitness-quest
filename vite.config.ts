/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://imachickenface.github.io/fitness-quest/
const base = '/fitness-quest/';

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      // the scene lab (M10) ships as its own page until the scene joins the Quests screen
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lab: fileURLToPath(new URL('./scene-lab.html', import.meta.url)),
      },
    },
  },
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
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,webmanifest,woff2,json}'],
        // scene and character art is fetched when a scene is shown, not downloaded up front for everyone
        globIgnores: [
          '**/node_modules/**/*',
          'sw.js',
          'workbox-*.js',
          'scenes/**',
          'characters/**',
        ],
        // the bundled USDA food list (public/foods.json) must be precached for offline search
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // the barcode polyfill's decoder: only phones without a native BarcodeDetector need it
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'wasm' },
          },
          // scene and character art: cached once seen, then it works offline
          {
            urlPattern: /\/(scenes|characters)\/.+\.(webp|json)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'scenes' },
          },
          // hero models: only the chosen one is ever fetched, then it works offline
          {
            urlPattern: /\/hero\/[\w-]+\.glb$/,
            handler: 'CacheFirst',
            options: { cacheName: 'hero' },
          },
        ],
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        // the live tests share two test accounts on the test project, so they run one file at a time
        extends: true,
        test: {
          name: 'live',
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
