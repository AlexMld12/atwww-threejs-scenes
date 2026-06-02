import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SCENE_NAME = path.basename(__dirname);

// `base: './'` keeps every asset path relative, so the built bundle works at
// any URL (e.g. https://USER.github.io/ATWWW/hero-glass/).
//
// `npm run build` writes the built site to `../docs/<scene-name>/`. That puts
// the output inside the parent repo's `docs/` folder, which is the path
// GitHub Pages serves from when you select "Deploy from a branch → /docs".
export default defineConfig({
  base: './',
  build: {
    outDir: path.resolve(__dirname, '..', 'docs', SCENE_NAME),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
});
