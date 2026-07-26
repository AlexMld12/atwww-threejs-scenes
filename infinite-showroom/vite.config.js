import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SCENE_NAME = path.basename(__dirname);

// Mirrors command-center-slider: `base: './'` keeps asset paths relative so the
// built bundle works at any URL, and `npm run build` writes to
// `../docs/<scene-name>/` (the GitHub Pages / jsDelivr source).
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5174,
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'docs', SCENE_NAME),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
    // Stable, unhashed entry filename so the Webflow <script> can point at a
    // fixed jsDelivr URL (…/assets/infinite-showroom.js) that never changes on
    // rebuild. Cache-bust on deploy by pinning the URL to a git tag/commit.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/infinite-showroom.js',
        chunkFileNames: 'assets/[name].js',
        // Keep the mobile image set in its own folder. Rollup flattens every asset
        // into one directory by default, so `field/Caylus.webp` and
        // `field/mobile/Caylus.webp` collide and the loser is renamed
        // `Caylus2.webp` — the URLs still resolve (main.js reads them from the
        // glob) but the published folder becomes unreadable, and you can't tell
        // which tier a file belongs to. Mirroring the source split keeps
        // docs/infinite-showroom/assets/ browsable.
        assetFileNames: (info) => {
          const src = info.originalFileNames?.[0] || info.originalFileName || info.name || '';
          return src.includes('/mobile/') ? 'assets/mobile/[name][extname]' : 'assets/[name][extname]';
        },
      },
    },
  },
});
