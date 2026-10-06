// Secțiunea GALERIE → ANCIENT WISDOM — sticky, ca „origin" de pe drinksom.eu. Formulele
// sunt COPIATE din codul lor (chunk 5baabc9d998219fd.js, componenta cu `video-s.mp4`),
// citit 2026-10-06; varianta de desktop:
//
//   R  = cât din partea fixată s-a parcurs (0 → 1 pe 280vh − 100vh)
//   e  = R netezit: e += (R − e) · 0.1 pe cadru   (lerpFactor)
//   k  = smoothstep(clamp(e / 0.35))             grila urcă până videoclipul e pe centru
//   t  = e ≤ 0.45 ? (e/0.45)³ · 0.15             mărire discretă la început
//        : 0.15 + 0.85 · easeOutCubic((e − 0.45) / 0.47)   apoi până acoperă ecranul
//   E  = 1 + (țintă − 1) · t,  țintă = max(vw / w_video, vh / h_video)
//   grila: translateY(−Δ · k) scale(E), originea = centrul videoclipului,
//          Δ = cât e centrul videoclipului sub mijlocul ecranului
//   O  = clamp((e − 0.7) / 0.15)                 titlul + textul (opacitate)
//   cuvintele paragrafului intră (0.5 s expo.out, decalaj 0.03 s, +0.15 s) când
//   (R − 0.7)/0.15 > 0.05 și se resetează la 0
//
// Ce e din MACHETĂ / de la USER, peste drinksom:
//   · masca navy: 5% pe video în grilă → 70% pe TOT ecranul pe Ancient Wisdom, după
//     mărirea video-ului (două măști compuse, vezi mai jos);
//   · header-ul și JOIN CLUB / BUY NOW dispar pe galerie și revin pe Ancient Wisdom, cu
//     CTA-urile mutate în mijlocul ecranului;
//   · ORDINEA la revenire (user, 2026-10-06), toată legată de scroll ca să țină și la
//     scroll rapid — înainte, CTA-urile urcau cu o tranziție de 0.9 s și treceau peste
//     textele deja apărute:
//        e ≥ 0.60          header + CTA-uri reapar, JOS (video-ul e ~aproape full-screen)
//        e 0.64 → 0.74     CTA-urile urcă în mijlocul ecranului (smoothstep)
//        e 0.76 → 0.88     titlul + paragraful apar (drinksom: 0.70 → 0.85, mutat după urcare)
//   · fără colțuri rotunjite și fără strângerea golurilor (drinksom le are; macheta nu).
import { fillWords } from './words.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const LERP = 0.1;
const PHASE1 = 0.45, PHASE2 = 0.92, SUBTLE = 0.15;
// ordinea la revenirea header-ului (vezi antetul)
const CHROME_AT = 0.60, CTA_FROM = 0.64, CTA_LEN = 0.10, TEXT_FROM = 0.76, TEXT_LEN = 0.12;

export function initGallery(scroll) {
  const section = document.querySelector('.gallery');
  if (!section) return;
  const zoom = section.querySelector('.gallery__zoom');
  const tile = section.querySelector('.g-tile--video');
  const video = section.querySelector('.g-video');
  const mask = section.querySelector('.g-mask');
  const screenMask = section.querySelector('.g-screen-mask');
  const wisdom = section.querySelector('.wisdom');
  const text = section.querySelector('.wisdom__text');
  const root = document.documentElement;

  const words = fillWords(text, text.textContent.trim());
  words.forEach((w) => w.classList.add('is-below'));

  // videoclipul se încarcă abia când secțiunea e la un ecran distanță (drinksom:
  // IntersectionObserver cu rootMargin 100%) — altfel ar trage 1 MB la prima încărcare
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    video.src = video.dataset.src;
    video.play?.().catch(() => {});
    io.disconnect();
  }, { rootMargin: '100%' });
  io.observe(section);

  // geometria videoclipului în grilă (offset*, deci NEscalată de transform)
  let geo = null;
  const measure = () => {
    geo = {
      w: tile.offsetWidth,
      h: tile.offsetHeight,
      cx: tile.offsetLeft + tile.offsetWidth / 2,
      cy: tile.offsetTop + tile.offsetHeight / 2,
    };
    zoom.style.transformOrigin = `${geo.cx}px ${geo.cy}px`;
  };
  measure();
  addEventListener('resize', measure);

  let e = 0, wordsIn = false, chromeOff = false, lastShift = -1;
  const setChrome = (off) => { if (off !== chromeOff) { chromeOff = off; root.classList.toggle('chrome-off', off); } };

  scroll.onFrame(() => {
    const vw = innerWidth, vh = innerHeight;
    const r = section.getBoundingClientRect();
    const span = r.height - vh;
    const R = span > 0 ? clamp01(-r.top / span) : 0;
    e = Math.abs(R - e) > 1e-4 ? e + (R - e) * LERP : R;

    const ks = clamp01(e / 0.35), k = ks * ks * (3 - 2 * ks);
    const t = e <= PHASE1
      ? Math.pow(e / PHASE1, 3) * SUBTLE
      : SUBTLE + (1 - SUBTLE) * (1 - Math.pow(1 - clamp01((e - PHASE1) / (PHASE2 - PHASE1)), 3));
    const target = Math.max(vw / geo.w, vh / geo.h);
    const E = 1 + (target - 1) * t;
    const dy = geo.cy - vh / 2;
    zoom.style.transform = `translateY(${(-dy * k).toFixed(2)}px) scale(${E.toFixed(4)})`;

    const O = clamp01((e - TEXT_FROM) / TEXT_LEN);
    // Două măști: una pe tot ecranul (As = 0.7·t) și cea de pe placa video (At). Peste
    // video ele se compun: 1 − (1 − As)(1 − At) trebuie să fie ținta 0.05 + 0.65·t (5% în
    // grilă, ca în machetă → 70% pe Ancient Wisdom) — de aici At. La t = 1, At = 0 și
    // rămâne doar masca de ecran, de 70%, peste tot.
    const As = 0.7 * t;
    const At = Math.max(0, 1 - (1 - (0.05 + 0.65 * t)) / (1 - As));
    screenMask.style.setProperty('--g-screen', As.toFixed(4));
    mask.style.setProperty('--g-mask', At.toFixed(4));
    wisdom.style.setProperty('--g-o', O.toFixed(3));

    // cuvintele: intră o dată când textul începe să apară, se resetează când dispare
    const Rw = clamp01((R - TEXT_FROM) / TEXT_LEN);
    if (Rw > 0.05 && !wordsIn) {
      wordsIn = true;
      words.forEach((w, j) => {
        w.style.transitionDelay = `${0.15 + 0.03 * j}s`;
        w.classList.replace('is-below', 'is-enter');
      });
    } else if (Rw === 0 && wordsIn) {
      wordsIn = false;
      words.forEach((w) => { w.classList.remove('is-enter'); w.style.transitionDelay = ''; w.classList.add('is-below'); });
    }

    // header + CTA: ascunse cât galeria e pe ecran înainte de video full-screen. Pragul de
    // intrare: vârful secțiunii trece de jumătatea ecranului — de acolo galeria domină.
    const inSection = r.top < vh * 0.5 && r.bottom > vh * 0.5;
    setChrome(inSection && e < CHROME_AT);
    // la IEȘIRE (secțiunea 7 urcă peste Ancient Wisdom) CTA-urile coboară înapoi, tot din
    // scroll: pe măsură ce capătul secțiunii trece de la 100% la 40% din ecran — altfel
    // săreau jos dintr-odată când se termina secțiunea (user: „se mută iar jos").
    // ⚠️ legat de MARGINEA secțiunii următoare (user: „să își schimbe poziția când trecem la
    // următoarea secțiune"): coboară cât marginea urcă de la josul ecranului la mijloc.
    const leave = clamp01((r.bottom - vh * 0.5) / (vh * 0.5));
    const m = r.top < vh * 0.5 ? clamp01((e - CTA_FROM) / CTA_LEN) * leave : 0;
    const shift = m * m * (3 - 2 * m);
    if (Math.abs(shift - lastShift) > 1e-4) { lastShift = shift; root.style.setProperty('--cta-shift', shift.toFixed(4)); }
  });
}
