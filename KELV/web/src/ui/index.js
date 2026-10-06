// DOM + scroll. Lenis dă scroll-ul neted; `scroll` e starea pe care o citesc și
// animațiile de DOM, și scena.
import Lenis from 'lenis';
import { initChrome } from './chrome.js';
import { initLoop } from './loop.js';
import { initSnap } from './snap.js';
import { initTicks } from './ticks.js';
import { initZoomCards } from './zoom.js';
import { initHovers } from './hover.js';
import { initPillars } from './pillars.js';
import { initGallery } from './gallery.js';
import { initJoin } from './join.js';
import { initTravel } from './travel.js';
import { initRoute } from './route.js';

export function initUI() {
  const scroll = { y: 0, progress: 0, velocity: 0 };

  // Opțiunile lui drinksom.eu (LenisProvider-ul lor, citit din cod): `infinite` = bucla
  // footer → hero (vezi loop.js); `syncTouch` e cerut de `infinite` pe touch; lerp 0.14.
  const lenis = new Lenis({
    lerp: 0.14,
    smoothWheel: true,
    infinite: true,
    syncTouch: true,
    syncTouchLerp: 0.1,
    touchMultiplier: 1,
  });
  lenis.on('scroll', (l) => {
    scroll.y = l.scroll;
    scroll.progress = l.progress;
    scroll.velocity = l.velocity;
  });

  // Un singur rAF pe tot site-ul: Lenis îl conduce, scena se agață de el (`onFrame`).
  const frameFns = new Set();
  function raf(t) {
    lenis.raf(t);
    for (const fn of frameFns) fn(t);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  scroll.onFrame = (fn) => { frameFns.add(fn); return () => frameFns.delete(fn); };

  // ⚠️ `scroll.y` se inițializează din pagină, nu rămâne 0 până la primul eveniment Lenis:
  // altfel, la un refresh în mijlocul paginii, bara și cardul ar porni din starea „sus".
  scroll.y = scrollY;
  // ⚠️ chrome ÎNAINTEA lui hovers și ticks: clona stratului fix trebuie să existe când
  // acelea își caută elementele (vezi chrome.js)
  initChrome(scroll);
  // copia hero-ului pentru buclă — ÎNAINTE de orice modifică hero-ul (reveal-uri etc.)
  initLoop();
  initSnap(lenis);
  initHovers();
  initTicks(scroll);
  initZoomCards(scroll);
  initPillars(scroll);
  initGallery(scroll);
  initJoin();
  initTravel(scroll);
  // /skin-analysis: OPEN SHOP → analiza, în același document (route.js)
  const route = initRoute(lenis);
  // reveal-urile NU pornesc aici, ci din main.js, după poarta de afișare

  // ?dbg=1 expune puntea pentru harness-ul CDP (aceeași convenție ca la SUBKEY)
  if (new URLSearchParams(location.search).has('dbg')) window.__dbg = { lenis, scroll };

  return { lenis, scroll, route };
}
