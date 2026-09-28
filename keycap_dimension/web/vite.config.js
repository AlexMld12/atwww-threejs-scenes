import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// In dev, orice ruta de pagina care nu exista primeste `404.html`, ca pe Vercel.
// ⚠️ Fara asta Vite ar servi `index.html` (fallback de SPA) pe orice adresa, deci o
// greseala de URL ar fi pornit toata scena in loc sa arate eroarea — si nici n-ai fi
// putut verifica 404-ul local decat deschizand direct `/404.html`.
// Se ating DOAR cererile de pagina: fara extensie, nu interne Vite (`/@…`), nu `/src/`.
const notFoundInDev = {
  name: 'not-found-in-dev',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = (req.url || '/').split('?')[0];
      const isPage = path !== '/' && !path.includes('.') && !path.startsWith('/@')
        && !path.startsWith('/src/') && !path.startsWith('/node_modules/');
      if (isPage && !existsSync(resolve(__dirname, '.' + path + '.html'))) req.url = '/404.html';
      next();
    });
  },
};

export default defineConfig({
  // ⚠️ `appType: 'mpa'`: site-ul are acum DOUA pagini (index + 404), nu e SPA.
  appType: 'mpa',
  plugins: [notFoundInDev],
  // ⚠️ `assetsInlineLimit: 0`. Implicit Vite inlineaza ca data: URI orice asset sub 4 KB.
  // Pentru noi ar fi un pas inapoi: paginile astea traiesc din cache-ul de browser
  // (GLB-urile cache-uite sunt motivul pentru care preview-urile se incarca instant),
  // iar un asset inline nu se cacheaza separat.
  build: {
    assetsInlineLimit: 0,
    target: 'es2022',       // import maps cereau oricum Chrome 89+/Safari 16.4+
    sourcemap: true,
    // `404.html` la radacina lui `dist/` e ce serveste Vercel pe orice ruta inexistenta.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        notFound: resolve(__dirname, '404.html'),
      },
    },
  },
  server: {
    port: 5173,
    // Serverul de dev trebuie sa raspunda pe 127.0.0.1, ca harness-ul CDP sa-l poata
    // deschide cu aceeasi reteta ca `python -m http.server`.
    host: '127.0.0.1',
  },
});
