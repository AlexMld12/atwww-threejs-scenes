import { defineConfig } from 'vite';

export default defineConfig({
  // ⚠️ `assetsInlineLimit: 0`: nimic inline ca data: URI — asset-urile separate se
  // cache-uiesc separat (aceeași decizie ca la SUBKEY).
  build: {
    assetsInlineLimit: 0,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    // ⚠️ 5174, NU 5173: 5173 e al lui SUBKEY (keycap_dimension). Așa pot rula amândouă
    // în paralel, iar `/resume` din fiecare proiect își deschide doar portul lui.
    port: 5174,
    strictPort: true,
    // 127.0.0.1, ca harness-ul de capturi (Chrome headless) să-l deschidă direct
    host: '127.0.0.1',
  },
});
