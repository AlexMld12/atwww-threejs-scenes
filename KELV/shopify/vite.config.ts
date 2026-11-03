import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { shopifyPreview } from './preview/server.ts';

const ASSETS = fileURLToPath(new URL('./theme/assets', import.meta.url));
const BUILT = /^kelv(-.+)?\.(js|css)$/;

/** The build writes into theme/assets next to the static files: only its own earlier output is removed. */
function cleanBuiltAssets(): Plugin {
  return {
    name: 'kelv:clean-built-assets',
    apply: 'build',
    buildStart() {
      for (const file of readdirSync(ASSETS)) if (BUILT.test(file)) rmSync(`${ASSETS}/${file}`);
    },
  };
}

export default defineConfig({
  // Chunks import each other relative to the entry, which Shopify serves from its own CDN path.
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
  plugins: [cleanBuiltAssets(), shopifyPreview()],
  build: {
    outDir: ASSETS,
    emptyOutDir: false,
    assetsDir: '',
    modulePreload: { polyfill: false },
    target: 'es2022',
    // three.js alone is ~0.9 MB; it loads on its own, after the page.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      // The stylesheet is its own entry: the layout links it in <head>, it is never injected by the code.
      // kelv.js only imports the app: Shopify adds `?v=` to it, and a second URL would run the app twice.
      input: {
        kelv: fileURLToPath(new URL('./src/boot.ts', import.meta.url)),
        app: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
        styles: fileURLToPath(new URL('./src/styles/index.css', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'kelv' ? 'kelv.js' : 'kelv-[name]-[hash].js'),
        chunkFileNames: 'kelv-[name]-[hash].js',
        // three.js, shared by the scenes, in a chunk of its own.
        advancedChunks: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] },
        assetFileNames: 'kelv[extname]',
      },
    },
  },
});
