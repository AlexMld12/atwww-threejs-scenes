// Produsul care CĂLĂTOREȘTE: apare pe secțiunea 7 (după ce userul a derulat destul,
// ca să nu acopere formularul), se rotește prin zona 8 și aterizează în footer
// (cerința userului, 2026-10-06: „produsul se învârte și ajunge în footer").
//
// Trei poze, din machetă (centrul pătratului imaginii față de centrul ecranului, în px
// de machetă, + rotația în plan, citite din matricea imaginii în PDF):
//   J  secțiunea 7      (−5.85,  +0.85)  10.03°
//   M  zona 8, la mijloc (−8.70,  −6.00)  −15°
//   F  footer           (−10.85, −56.15) 10.03°
// Drumul e legat de scroll, în două etape cu easeInOutCubic:
//   s0 = secțiunea 7 se desprinde (capătul părții fixate) → s1 = mijlocul zonei 8 pe
//   mijlocul ecranului → s2 = footer-ul umple ecranul. După s2 (bucla) produsul urcă
//   odată cu footer-ul.
// Pe drum produsul face două ture pe Y (o tură pe etapă); cele două fețe au aceeași
// imagine, deci ture întregi lasă produsul exact cum era.
// Când vine GLB-ul, aceleași valori (poza, rotația pe Y) conduc modelul din scena three.js.
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const k = () => Math.max(1, innerWidth / 1720);   // px machetă → px ecran (formula clamp)

const POSES = {
  J: { x: -5.85, y: 0.85, a: 10.03 },
  M: { x: -8.7, y: -6, a: -15 },
  F: { x: -10.85, y: -56.15, a: 10.03 },
};
// ⚠️ 0.6 din partea fixată a secțiunii 7 (220vh → 120vh fixat) ≈ 72vh de scroll după
// fixare. La 0.35 din 60vh (≈ 21vh) apărea prea repede peste formular (user, 2026-10-06).
export const PRODUCT_AT = 0.6;
const FADE_OUT = 0.45;   // fracțiune din ecran în care produsul se stinge, după footer

export function initTravel(scroll) {
  const el = document.querySelector('.travel-product');
  const join = document.querySelector('.join');
  const travel = document.querySelector('.travel');
  const footer = document.querySelector('.footer');
  if (!el || !join || !travel || !footer) return;
  const reveal = el.querySelector('.tp-reveal');
  const spin = el.querySelector('.tp-spin');
  const root = document.documentElement;

  let shown = false, ctaOff = false, lastSy = scrollY, fade = 1;
  scroll.onFrame(() => {
    const vh = innerHeight, sy = scrollY;
    const jump = Math.abs(sy - lastSy) > vh * 0.5;
    lastSy = sy;
    const jr = join.getBoundingClientRect();
    const tr = travel.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();

    // apariția: după PRODUCT_AT din partea fixată a secțiunii 7 (și tot restul paginii)
    const jspan = jr.height - vh;
    const jy = jspan > 0 ? clamp01(-jr.top / jspan) : 0;
    const show = jy >= PRODUCT_AT;
    // ⚠️ Intro-ul (tranziția în timp) se joacă DOAR la un scroll continuu peste prag. La un
    // SALT (bucla: scroll în sus din hero → direct în footer; sau orice scrollTo) starea se
    // pune pe loc — altfel produsul se rotea/creștea în fața userului în footer (user,
    // 2026-10-06: „văd animația când intru în secțiune"). Înainte de is-ready, la fel.
    if (show !== shown) {
      shown = show;
      const instant = jump || !root.classList.contains('is-ready');
      if (instant) reveal.style.transition = 'none';
      reveal.classList.toggle('is-in', show);
      if (instant) { void reveal.offsetWidth; reveal.style.transition = ''; }
    }

    // drumul, în coordonate de pagină
    const s0 = sy + jr.bottom - vh;                       // secțiunea 7 se desprinde
    const s1 = sy + tr.top + tr.height / 2 - vh / 2;      // mijlocul zonei 8 pe mijloc
    const s2 = sy + fr.top;                               // footer-ul umple ecranul
    let from = POSES.J, to = POSES.J, t = 0, turns = 0;
    if (sy > s0 && sy <= s1) { from = POSES.J; to = POSES.M; t = ease(clamp01((sy - s0) / (s1 - s0))); turns = t; }
    else if (sy > s1) { from = POSES.M; to = POSES.F; t = ease(clamp01((sy - s1) / (s2 - s1))); turns = 1 + t; }
    const kk = k();
    // după footer (bucla): produsul pleacă în sus ODATĂ cu footer-ul, ca și cum ar fi lipit
    // de el — altfel ar rămâne fix peste copia hero-ului
    const past = Math.max(0, sy - s2);
    // și se stinge treptat cât footer-ul pleacă (cererea userului, 2026-10-06): de la 0 la
    // FADE_OUT din ecran, cu easeInOutCubic — la ~14% (footer-ul urcat cu 120 px din 867)
    // e încă aproape plin, apoi dispare înainte să ajungă peste copia hero-ului.
    const f = 1 - ease(clamp01(past / (vh * FADE_OUT)));
    if (f !== fade) { fade = f; el.style.opacity = f < 1 ? f.toFixed(3) : ''; }
    el.style.setProperty('--tp-x', `${(lerp(from.x, to.x, t) * kk).toFixed(2)}px`);
    el.style.setProperty('--tp-y', `${(lerp(from.y, to.y, t) * kk - past).toFixed(2)}px`);
    el.style.setProperty('--tp-a', `${lerp(from.a, to.a, t).toFixed(3)}deg`);
    spin.style.setProperty('--tp-spin', `${(turns * 360).toFixed(2)}deg`);

    // în footer CTA-urile dispar (cadrul footer-ului din machetă nu le are; footer-ul are
    // bara lui de linkuri). Header-ul rămâne — liniuțele se umplu complet aici.
    const off = fr.top < vh * 0.5 && fr.bottom > vh * 0.5;   // pe buclă (hero) revin
    if (off !== ctaOff) { ctaOff = off; root.classList.toggle('cta-off', off); }
  });
}
