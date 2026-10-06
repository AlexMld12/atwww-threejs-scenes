// Secțiunea PILLARS (Mental Focus / Stamina Boost / Imune Control) — sticky, ca
// „power-pillars" de pe drinksom.eu. Formulele de timeline sunt COPIATE din codul lor
// (chunk 5baabc9d998219fd.js, componenta cu `som:pillar-change`), citit 2026-10-06:
//
//   y  = cât din partea fixată s-a parcurs           (0 → 1 pe 320vh − 100vh)
//   N  = intrarea cardului (0 → 1 pe ultimul ecran înainte de fixare); U = N ≥ 1
//   F  = clamp((y − 0.3) / 0.7)                       primele 30% = pauză pe pilonul 1
//   $  = (F ≤ 0.1 ? F/0.1·0.25 : 0.25 + (F−0.1)/0.9·0.75) · n   poziția continuă
//   D  = min(n − 1, floor($))                         pilonul curent
//   B  = easeInOutCubic(clamp(($ − D − 0.65) / 0.35)) trecerea spre D+1, în ultimele
//                                                     35% ale fiecărui segment
// Fundalurile: stratul i are opacitatea 1−B dacă i = D, B dacă i = D+1 (cel de bază e
// mereu sub ele). Textele se schimbă discret — ⚠️ NU la schimbarea lui D, ca la ei, ci
// la mijlocul tranziției (B = 0.5), odată cu tot restul: vezi UN SINGUR PUNCT DE SCHIMBARE.
//
// Ce e AL USERULUI, peste drinksom (2026-10-06):
//   · cercurile apar „trasate cu compasul" la intrarea pilonului lor;
//   · produsul se ROTEȘTE la scroll și se schimbă cu următorul — legat de același B ca
//     fundalurile; schimbarea cade pe muchie (la B = 0.5, unghiul e 270°), deci nu se vede;
//   · produsul se înclină spre partea OPUSĂ celei atinse de mouse („ca și cum l-ai
//     împinge"), și se rotește la click.
// Acum cu imaginile din Figma; când vin GLB-urile, aceleași valori (B, tilt, click)
// conduc modelul din scena three.js.

import { fillWords, fillLines } from './words.js';

// px din machetă → px pe ecran, aceeași formulă ca tokenii clamp(N, N/1720·100vw)
const k = () => Math.max(1, innerWidth / 1720);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

// Conținutul pilonilor. Poziții în px de machetă, față de centrul ecranului (720, 425 în
// cadrul de 850): centrul pătratului imaginii, latura lui și rotația de repaus — citite din
// matricea de transformare a imaginii în PDF.
const PILLARS = [
  {
    a: 'Mental', b: 'Focus', accent: 'var(--c-orange)', id: '01',
    product: { img: '/images/product-1.webp', x: 10.25, y: -3, s: 736, a: 10.03 },
    rings: [{ x: 209, y: 309, r: 651.5 }],
  },
  {
    a: 'Stamina', b: 'Boost', accent: 'var(--c-orange)', id: '02',
    product: { img: '/images/product-2.webp', x: 3.2, y: -42.15, s: 805.4, a: -6.1 },
    rings: [],      // cercul vizibil în cadrul 2 face parte din imagine (ochiul), nu e vector
  },
  {
    a: 'Imune', b: 'Control', accent: 'var(--c-ink)', id: '03',
    product: { img: '/images/product-3.webp', x: 0.25, y: -37.2, s: 829.4, a: 1.67 },
    rings: [{ x: -193.5, y: 106.5, r: 431 }, { x: 351, y: 283, r: 487.5 }],
  },
];
// Textele sunt aceleași în toate cadrele machetei (placeholder de la designer)
const DESC = 'Lorem ipsum dolor sit amet consectetur. Ultricies sagittis id lorem id enim velit id sodales mauris. Augue vel mauris';
const TAG = 'Three steps back to\nThree lorcsa dkjad back to baseline.';

const TILT_MAX = 18;       // grade, la marginea zonei produsului (14 abia se vedea în capturi)
const TILT_EASE = 0.12;    // cât din distanță recuperează tilt-ul pe cadru
const CLICK_SPIN_S = 1.2;  // durata rotirii la click
const SCROLL_TURNS = 1.5;  // câte ture face produsul pe o trecere (180° + o tură întreagă)

export function initPillars(scroll) {
  const section = document.querySelector('.pillars');
  if (!section) return;
  const sticky = section.querySelector('.pillars__sticky');
  const bgs = [...section.querySelectorAll('.pillar-bg')];
  const title = section.querySelector('.pillar-title');
  const titleA = title.querySelector('.pillar-title__a');
  const titleB = title.querySelector('.pillar-title__b');
  const idEl = section.querySelector('.pillar-copy__id');
  const desc = section.querySelector('.pillar-copy__desc');
  const tag = section.querySelector('.pillar-tag');
  const els = [...section.querySelectorAll('.pl-el')];
  const product = section.querySelector('.pillar-product');
  const spin = product.querySelector('.pillar-product__spin');
  const [front, back] = product.querySelectorAll('.pillar-product__face');
  const ringsBox = section.querySelector('.pillar-rings');
  const n = PILLARS.length;

  // imaginile produselor se încarcă dinainte: o schimbare de `src` pe o imagine
  // nedecodată ar clipi exact în mijlocul rotației
  PILLARS.forEach((p) => { const im = new Image(); im.src = p.product.img; im.decode?.().catch(() => {}); });

  // ---- cercurile ----
  const v = (px) => {
    const a = Math.abs(px), s = `clamp(${a}px, ${(a / 17.2).toFixed(5)}vw, ${(a / 17.2).toFixed(5)}vw)`;
    return px < 0 ? `calc(-1 * ${s})` : s;
  };
  const ringEls = PILLARS.map((p) => p.rings.map((r) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'pillar-ring');
    svg.setAttribute('viewBox', `0 0 ${2 * r.r} ${2 * r.r}`);
    svg.style.setProperty('--rx', v(r.x));
    svg.style.setProperty('--ry', v(r.y));
    svg.style.setProperty('--rr', v(r.r));
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', r.r); c.setAttribute('cy', r.r); c.setAttribute('r', r.r);
    c.setAttribute('pathLength', '1');
    c.setAttribute('stroke-width', '1');
    svg.appendChild(c);
    ringsBox.appendChild(svg);
    return svg;
  }));
  let ringsFor = -1;
  function showRings(i) {
    if (ringsFor === i) return;
    ringsFor = i;
    ringEls.forEach((list, j) => list.forEach((svg) => {
      if (j === i) {
        svg.classList.remove('is-gone');
        // un cadru în starea „nedesenat", apoi trasarea — altfel n-ar avea de unde porni
        svg.classList.remove('is-drawn');
        svg.getBoundingClientRect();
        requestAnimationFrame(() => svg.classList.add('is-drawn'));
      } else if (svg.classList.contains('is-drawn')) {
        svg.classList.add('is-gone');
        setTimeout(() => { if (svg.classList.contains('is-gone')) svg.classList.remove('is-drawn'); }, 400);
      }
    }));
  }

  // ---- textele ----
  let shown = 0;               // pilonul ale cărui texte sunt afișate (M la drinksom)
  let swapTimer = null;
  function setStatic(i) {
    const p = PILLARS[i];
    titleA.textContent = p.a;
    titleB.textContent = p.b;
    title.style.setProperty('--pl-accent', p.accent);
    idEl.textContent = p.id;
    fillWords(desc, DESC);
    fillLines(tag, TAG);
    shown = i;
  }
  setStatic(0);

  function swapTo(i) {
    // titlul se schimbă PE LOC și vine din blur (drinksom: folosește D, nu M)
    const p = PILLARS[i];
    titleA.textContent = p.a;
    titleB.textContent = p.b;
    title.style.setProperty('--pl-accent', p.accent);
    for (const s of [titleA, titleB]) s.classList.add('is-swap');
    title.getBoundingClientRect();
    for (const s of [titleA, titleB]) s.classList.remove('is-swap');

    // cuvintele și rândurile ies în sus, apoi intră cele noi de jos
    clearTimeout(swapTimer);
    let t = 0;
    [[desc, 0], [tag, 0.06]].forEach(([el, delay]) => {
      const parts = [...el.querySelectorAll('.sw-in')];
      parts.forEach((s, j) => {
        s.classList.remove('is-enter', 'is-below');
        s.style.transitionDelay = `${delay + 0.015 * j}s`;
        s.classList.add('is-out');
      });
      t = Math.max(t, delay + 0.25 + 0.015 * Math.max(0, parts.length - 1));
    });
    swapTimer = setTimeout(() => {
      idEl.textContent = p.id;
      const fresh = [...fillWords(desc, DESC), ...fillLines(tag, TAG)];
      fresh.forEach((s) => s.classList.add('is-below'));
      desc.getBoundingClientRect();
      [desc, tag].forEach((el) => [...el.querySelectorAll('.sw-in')].forEach((s, j) => {
        s.style.transitionDelay = `${0.03 * j}s`;
        s.classList.replace('is-below', 'is-enter');
      }));
      shown = i;
    }, t * 1000);
  }

  // ---- intrarea / ieșirea elementelor (U) ----
  let on = false;
  function setOn(v2) {
    if (v2 === on) return;
    on = v2;
    if (on) {
      els.forEach((e) => e.classList.add('pl-pre'));
      sticky.getBoundingClientRect();
      sticky.classList.add('is-on');
      els.forEach((e) => e.classList.remove('pl-pre'));
      ringsFor = -1;
    } else {
      sticky.classList.remove('is-on');
      showRings(-1);
    }
  }

  // ---- produsul: tilt de la mouse + rotire la click ----
  const hit = document.createElement('div');
  hit.className = 'pillar-product__hit';
  product.appendChild(hit);
  let tgtX = 0, tgtY = 0, curX = 0, curY = 0;
  hit.addEventListener('pointermove', (e) => {
    const r = hit.getBoundingClientRect();
    const nx = clamp01((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = clamp01((e.clientY - r.top) / r.height) * 2 - 1;
    // partea atinsă se duce ÎNAPOI: dreapta atinsă → rotateY pozitiv (marginea dreaptă
    // fuge de ecran); sus atins → rotateX pozitiv (marginea de sus fuge de ecran)
    tgtY = nx * TILT_MAX;
    tgtX = -ny * TILT_MAX;
  });
  hit.addEventListener('pointerleave', () => { tgtX = 0; tgtY = 0; });
  let clickT0 = -1;
  hit.addEventListener('click', () => { clickT0 = performance.now(); });

  // schimbă `src` doar când chiar diferă (altfel browserul ar reîncărca imaginea)
  const setSrc = (img, src) => { if (img.getAttribute('src') !== src) img.setAttribute('src', src); };

  // ---- bucla ----
  let V = -1;          // pilonul vizibil — vezi UN SINGUR PUNCT DE SCHIMBARE
  scroll.onFrame((now) => {
    const vh = innerHeight;
    const r = section.getBoundingClientRect();
    const span = r.height - vh;
    const y = span > 0 ? clamp01(-r.top / span) : 0;
    const N = clamp01((vh - r.top) / vh);
    setOn(N >= 1);

    const F = clamp01((y - 0.3) / 0.7);
    const pos = (F <= 0.1 ? (F / 0.1) * 0.25 : 0.25 + ((F - 0.1) / 0.9) * 0.75) * n;
    const D = Math.min(n - 1, Math.floor(pos));
    const B = D === n - 1 ? 0 : easeInOutCubic(clamp01((pos - D - 0.65) / 0.35));

    // fundalurile (stratul 0 e mereu dedesubt, la opacitate 1)
    for (let i = 1; i < n; i++) {
      const o = D === n - 1 ? (i === n - 1 ? 1 : 0) : i === D ? 1 - B : i === D + 1 ? B : 0;
      bgs[i].style.opacity = o;
    }

    // ⚠️ UN SINGUR PUNCT DE SCHIMBARE pentru tot: mijlocul tranziției (B = 0.5).
    // Raportat de user (2026-10-06): la scroll lent unele elemente se schimbau, altele nu.
    // Cauza: fundalul se schimba treptat pe toată fereastra B, textele abia la capătul ei
    // (la D + 1, cum face drinksom), iar produsul își alterna fețele de câteva ori pe cele
    // 1.5 ture (vechi / nou / vechi / nou). Acum `V` = pilonul vizibil trece la D + 1
    // exact la B = 0.5, unde fundalul e 50/50 și produsul e cu muchia spre ecran
    // (B · 540° = 270°). De `V` ascultă textele, titlul, cifra, cercurile și AMBELE fețe
    // ale produsului (deci nu mai alternează). Histerezis 0.47 / 0.53 DOAR pe texte, ca un
    // scroll oprit fix pe mijloc să nu le comute înainte și înapoi. Produsul NU are
    // histerezis: imaginea lui trece exact la B = 0.5 (270°, pe muchie) — cu 0.55 cădea la
    // 297°, la 27° de muchie, unde schimbul s-ar fi putut vedea.
    const mid = D < n - 1 && B >= 0.5 ? D + 1 : D;
    let want = mid;
    if (D < n - 1 && V === D + 1 && B > 0.47) want = D + 1;
    else if (V === D && B < 0.53) want = D;
    if (want !== V) {
      const first = V === -1;
      V = want;
      if (first || !on) setStatic(V); else if (V !== shown) swapTo(V);
    }
    setSrc(front, PILLARS[mid].product.img);
    setSrc(back, PILLARS[mid].product.img);
    if (on) showRings(V);

    // produsul: poziția / mărimea / rotația de repaus între D și D+1, după B
    const a = PILLARS[D].product, b = PILLARS[Math.min(D + 1, n - 1)].product, kk = k();
    product.style.setProperty('--px', `${lerp(a.x, b.x, B) * kk}px`);
    product.style.setProperty('--py', `${lerp(a.y, b.y, B) * kk}px`);
    product.style.setProperty('--ps', `${lerp(a.s, b.s, B) * kk}px`);
    product.style.setProperty('--pa', `${lerp(a.a, b.a, B)}deg`);

    // rotirea: din scroll (B · 1.5 ture → la B = 1 se vede fața din spate = următorul)
    // + din click (o tură, easeInOutCubic)
    let click = 0;
    if (clickT0 >= 0) {
      const t = (now - clickT0) / (CLICK_SPIN_S * 1000);
      if (t >= 1) clickT0 = -1; else click = easeInOutCubic(t) * 360;
    }
    curX += (tgtX - curX) * TILT_EASE;
    curY += (tgtY - curY) * TILT_EASE;
    spin.style.setProperty('--spin', `${B * SCROLL_TURNS * 360 + click}deg`);
    spin.style.setProperty('--tx', `${curX.toFixed(3)}deg`);
    spin.style.setProperty('--ty', `${curY.toFixed(3)}deg`);
  });
}
