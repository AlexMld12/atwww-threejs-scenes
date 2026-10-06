// Ruta /skin-analysis și trecerea home ↔ analiză (cererea userului, 2026-10-06: „să pară
// că nu intri pe altă pagină", și la fel de lin înapoi cu Back-ul browserului).
//
// De ce în ACELAȘI document (History API), nu o pagină separată:
//  · o pagină nouă = alb / reîncărcare; View Transitions între documente nu există în
//    Firefox și nu păstrează Lenis-ul, scena three.js și poziția din home;
//  · aici home-ul nu se descarcă: la întoarcere e exact unde l-ai lăsat (scroll, reveal-uri).
//
// Tranziția (1 s, [.76,0,.24,1] — ease-ul reveal-urilor site-ului):
//  · intrare — stratul analizei urcă peste home (clip-path de jos în sus), home-ul se
//    închide la culoare sub el (`.sa-scrim`), iar ecranul analizei intră în cascadă;
//  · ieșire — invers: stratul coboară și descoperă home-ul la poziția lui.
//  ⚠️ Se animă DOAR decupajul și perdeaua, nu poziția textelor: nimic nu se mișcă pe
//  fracțiuni de pixel, textul rămâne clar (regula din CLAUDE.md).
//
// După intrare analiza devine PAGINA (`html.sa-on`): în fluxul documentului, cu scroll-ul
// Lenis (fără bucla `infinite`, care e a home-ului), iar home-ul e scos din flux, invizibil.
// Așa există o singură bară de scroll, nu două (un strat fix cu scroll propriu ar fi
// adăugat-o pe a lui lângă a paginii).
import { initAnalysis } from '../analysis/view.js';

const PATH = '/skin-analysis';
const DUR = 1000;
const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
const SCRIM = 0.7;
const isSA = () => /^\/skin-analysis\/?$/.test(location.pathname);

export function initRoute(lenis) {
  const html = document.documentElement;
  const panel = document.querySelector('[data-analysis]');
  const scrim = document.querySelector('.sa-scrim');
  if (!panel) return { ready() {} };

  const view = initAnalysis({ root: panel, toTop: () => lenis.scrollTo(0, { duration: 0.8 }) });
  const TITLE_SA = 'KELV | Skin Analysis';
  const TITLE_HOME = 'KELV | Foam Cleanser';

  let open = html.classList.contains('sa-on');   // intrare directă (scriptul din <head>)
  let busy = false;
  let homeY = 0;
  if (open) lenis.options.infinite = false;

  async function play(enter) {
    busy = true;
    lenis.stop();
    html.classList.add('sa-anim');
    const clip = enter
      ? [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }]
      : [{ clipPath: 'inset(0% 0 0 0)' }, { clipPath: 'inset(100% 0 0 0)' }];
    const dim = enter ? [{ opacity: 0 }, { opacity: SCRIM }] : [{ opacity: SCRIM }, { opacity: 0 }];
    const a1 = panel.animate(clip, { duration: DUR, easing: EASE, fill: 'both' });
    const a2 = scrim.animate(dim, { duration: DUR, easing: EASE, fill: 'both' });
    try { await a1.finished; } catch { /* anulată — nu se întâmplă azi, dar nu crăpăm */ }
    return () => { a1.cancel(); a2.cancel(); };
  }

  async function openSA() {
    open = true;
    homeY = scrollY;
    panel.scrollTop = 0;
    document.title = TITLE_SA;
    const pending = play(true);
    // ecranul intră cât stratul urcă (după ~40% din drum, când e deja în ecran)
    view.enter(0.4);
    const done = await pending;
    // analiza devine pagina: în flux, scroll-ul documentului de la 0
    html.classList.add('sa-on');
    html.classList.remove('sa-anim');
    done();
    lenis.options.infinite = false;
    lenis.resize();
    lenis.scrollTo(0, { immediate: true, force: true });
    lenis.start();
    finish();
  }

  async function closeSA() {
    open = false;
    const y = scrollY;
    // stratul redevine fix, cu conținutul exact unde era (scrollTop pe un strat
    // `overflow: hidden` merge din JS), iar home-ul se întoarce în flux, la poziția lui
    html.classList.add('sa-anim');
    panel.scrollTop = y;
    html.classList.remove('sa-on');
    lenis.options.infinite = true;
    lenis.resize();
    lenis.scrollTo(homeY, { immediate: true, force: true });
    document.title = TITLE_HOME;
    const done = await play(false);
    html.classList.remove('sa-anim');
    done();
    lenis.start();
    finish();
  }

  // o tranziție odată; dacă userul a apăsat Back / OPEN SHOP în timpul ei, starea dorită
  // (din URL) se aplică la capăt
  function finish() {
    busy = false;
    sync();
  }
  function sync() {
    if (busy) return;
    if (isSA() && !open) openSA();
    else if (!isSA() && open) closeSA();
  }

  // OPEN SHOP (originalul și clona închisă din chrome.js) → analiza
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const toSA = e.target.closest(`a[href="${PATH}"]`);
    const toHome = e.target.closest('[data-sa-home]');
    if (toSA) {
      e.preventDefault();
      if (!isSA()) history.pushState({ sa: true, fromHome: true }, '', PATH);
      sync();
    } else if (toHome) {
      e.preventDefault();
      // venit din home → înapoi în istoric (Back-ul browserului rămâne coerent);
      // intrare directă → o intrare nouă spre home
      if (history.state?.fromHome) history.back();
      else { history.pushState({}, '', '/'); sync(); }
    }
  });
  addEventListener('popstate', sync);

  return {
    // după poarta de afișare (main.js): la intrarea directă, ecranul intră abia acum
    ready() { if (open) view.enter(0.1); },
  };
}
