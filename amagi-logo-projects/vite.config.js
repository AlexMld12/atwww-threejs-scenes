import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SCENE_NAME = path.basename(__dirname);

// `base: './'` keeps every asset path relative, so the built bundle works at any
// URL. `npm run build` writes to `../docs/<scene-name>/`, the folder GitHub Pages
// and jsDelivr both read from.
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5176,   // 5173 slider, 5174 nobg / KELV — this one can run alongside them
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'docs', SCENE_NAME),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
    // Stable, unhashed entry filename so the Webflow <script> can point at a fixed
    // jsDelivr URL (…/assets/amagi-logo.js). Cache-busting = jsDelivr purge.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/amagi-logo.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
