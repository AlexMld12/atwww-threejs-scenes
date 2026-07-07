import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SCENE_NAME = path.basename(__dirname);

// `base: './'` keeps every asset path relative, so the built bundle works at
// any URL (e.g. https://USER.github.io/<repo>/command-center-slider/).
//
// `npm run build` writes the built site to `../docs/<scene-name>/`. That puts
// the output inside the parent repo's `docs/` folder, which is the path
// GitHub Pages serves from when you select "Deploy from a branch → /docs".
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'docs', SCENE_NAME),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
    // Stable, unhashed entry filename so the Webflow <script> can point at a
    // fixed jsDelivr URL (…/assets/command-center.js) that doesn't change every
    // build. Cache-busting on deploy is handled by pinning the jsDelivr URL to a
    // git tag/commit instead of by the filename hash.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/command-center.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
