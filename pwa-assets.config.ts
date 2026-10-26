import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// The source icon is 16x16 pixel art: scale with nearest-neighbour so it stays crisp,
// and pad with the app's background colour instead of white.
const pixel = { kernel: 'nearest', background: '#14162b' } as const;

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0, resizeOptions: pixel },
    maskable: { ...minimal2023Preset.maskable, resizeOptions: pixel },
    apple: { ...minimal2023Preset.apple, resizeOptions: pixel },
  },
  images: ['public/icon.svg'],
});
