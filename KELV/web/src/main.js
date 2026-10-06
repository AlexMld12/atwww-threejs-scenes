// Punctul de intrare. Ține DOAR ordinea de pornire; logica stă în `scene/` (WebGL) și
// `ui/` (DOM + scroll). Cele două comunică printr-un singur obiect: `scroll` din ui,
// pe care scena îl citește în fiecare cadru — o singură sursă de adevăr pentru
// „unde sunt în pagină", lecția din SUBKEY (vezi CLAUDE.md, de ce nu Webflow).
import './styles/index.css';
import { initUI } from './ui/index.js';
import { startReveals } from './ui/reveal.js';

const ui = initUI();

// ---- poarta de afișare ----
// Pagina stă ascunsă (CSS-ul inline din index.html) până când CSS-ul e aplicat ȘI
// fonturile sunt gata — altfel la refresh se vedea o fracțiune de secundă DOM-ul
// nestilizat (logo-ul pe tot ecranul), apoi textul sărea din fontul de rezervă.
// CSS-ul e deja aplicat aici: importul de mai sus îl injectează înainte să ruleze codul.
// ⚠️ Plafon de 2 s pe fonturi: un font care nu vine nu are voie să țină pagina neagră
// (iar plasa din <head> o aprinde oricum la 3 s).
const fontsReady = Promise.race([
  document.fonts.ready,
  new Promise((r) => setTimeout(r, 2000)),
]);
fontsReady.then(() => {
  document.documentElement.classList.add('is-ready');
  // reveal-urile pornesc DUPĂ ce pagina e vizibilă — vezi nota din ui/reveal.js
  startReveals();
  ui.route.ready();
});

// Scena se încarcă DINAMIC: dacă three sau WebGL 2 nu merg, pagina rămâne utilizabilă
// (textele și placeholder-ul se văd oricum), doar fără 3D.
import('./scene/index.js')
  .then((m) => m.initScene({ scroll: ui.scroll }))
  .catch((e) => {
    document.documentElement.classList.add('no-3d');   // randarea din Figma în loc
    console.error('[scene]', e);
  });
