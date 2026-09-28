// Animațiile de DOM legate de scroll: navigația, titlurile, blocurile de info.
//
// ⚠️ NU citi poziția de scroll pe cont propriu și nu duplica `updateScroll` din scenă.
// Scena e deja singura sursă de adevăr și o anunță:
//   · `keycap:act`               -> { name }: 'intro' | 'steps' | 'outro'
//   · `keycap:step`              -> { index, total, key, label }; index e -1 în afara
//                                   actului de pași, 0..7 înăuntru
//   · `keycap:ready`             -> fără date: preloaderul a trecut ȘI blurul s-a stins.
//                                   Ăsta e momentul în care DOM-ul are voie să apară.
//   · `keycap:progress`          -> { name, p }: unde ești în actul curent, 0..1
//   · `keycap:anchor`            -> { x }: unde cade pe ecran coloana de piese, în px.
//                                   Vine la încărcare și la redimensionare.
//   · `document.body.dataset.step` -> "1".."8", gol în rest (se poate lega și din CSS)
// În sens invers pleacă unul singur:
//   · `keycap:herodone`          -> animația titlului s-a terminat, scena poate debloca
//                                   scroll-ul. Cât timp nu vine, pagina rămâne oprită
//                                   (scena are și un ceas de siguranță de 5 s).
//   · `keycap:modal`             -> { open }: stratul de About s-a deschis / închis;
//                                   scena oprește / repornește Lenis.
// Dacă ai nevoie și de alte momente, cere-le scenei ca evenimente noi, în același stil.

import { scramble, onScrambleIdle, splitChars, rnd, paintChar, focusAnim } from './fx.js';

// ---------------------------------------------------------------- logo → reîncărcare
// Userul a cerut ca logo-ul să ducă la aceeași pagină și să o reîncarce.
// ⚠️ `location.reload()`, nu `href="#"`: pagina trebuie să pornească de la capăt, cu
// preloader cu tot. Un `href` gol ar face oricum asta în majoritatea browserelor, dar
// nu în toate, iar `preventDefault` + `reload` e fără ambiguitate.
addEventListener('click', (e) => {
  const a = e.target.closest('[data-reload]');
  if (!a) return;
  e.preventDefault();
  location.reload();
});


// ============================================================================
// TEXTELE SITE-ULUI — singurul loc în care se editează copy-ul
// ============================================================================
// Din brieful userului (SUBKEY — Copy + HUD dinamic). Tot ce se vede scris pe pagină e
// aici; logica de mai jos nu conține niciun șir.
//
// ⚠️ PRESUPUNEREA §0 DIN BRIEF A FOST VERIFICATĂ ȘI NU SE POTRIVEȘTE PE DE-A-NTREGUL.
// Ordinea reală a celor 8 piese se citește din pozițiile lor la clipul parcat (vezi
// `buildSteps`), nu din brief:
//     1 keycap · 2 stem · 3 carcasă superioară · 4 arc · 5 lamelă de contact ·
//     6 carcasă inferioară · 7 LED · 8 pini
// Primele șase se potrivesc cap la cap cu briefull. Ultimele două NU: pe poziția 7 e un
// LED, iar PCB-ul din brief NU EXISTĂ în scenă. Deci:
//   · textul „07 — Pins" din brief a mers pe piesa 8, care chiar sunt pinii;
//   · pentru LED am scris eu textele, în aceeași voce; sunt de confirmat;
//   · textul „08 — PCB" din brief a rămas nefolosit.
// Maparea se face pe `key` (nodul din GLB), nu pe index — exact cum cere briefull.

const HERO_TXT = {
  nav: 'INFO SWITCH',
  l1:  'SCAN MODE: ACTIVE',
  l2:  'TARGET: MECHANICAL SWITCH',
  l4:  '84 KEYS / 84 SWITCHES / 672 PARTS / 1 YOU',
};

const FOOT_TXT = {
  nav: 'SCAN COMPLETE',
  l1:  'SCAN MODE: COMPLETE',
  l2:  'TARGET: RESOLVED',
  l4:  '8/8 PARTS / 0 MISSING / 1 KEYPRESS',
};

// ⚠️ COORDONATELE AU IEȘIT din toate secțiunile (cererea userului: „nu au sens").
// În locul lor, linia a doua spune la ce strat al switch-ului te uiți și ce rol are —
// tot în vocea de HUD. Numerotarea 01..08 s-a mutat AICI, fiindcă din nav a fost scoasă:
// în nav rămâne doar numele piesei.
// ⚠️ Textele astea sunt scrise de mine, nu sunt din brief. De confirmat.
const PARTS = [
  { key: 'key_cap',   nav: 'KEYCAP',
    mode: 'KEYCAP',           l2: 'LAYER 01/08 — SURFACE',
    data: 'PBT / 1.5MM WALL / DOUBLE-SHOT / 1 LEGEND',
    head: ['The only part', 'you ever [ touch ]'] },
  { key: 'Solid 208', nav: 'STEM',
    mode: 'STEM',             l2: 'LAYER 02/08 — MOTION',
    data: 'POM / CROSS MOUNT / 4.0MM TRAVEL / 2.0MM ACT',
    head: ['Four millimetres', 'of pure [ intent ]'] },
  { key: 'Solid 154', nav: 'TOP HOUSING',
    mode: 'TOP HOUSING',      l2: 'LAYER 03/08 — SHELL',
    data: 'PC / TRANSLUCENT / 4 CLIPS / 0.05MM TOL',
    head: ['The shell that', 'holds it [ steady ]'] },
  { key: 'Pipe',      nav: 'SPRING',
    mode: 'SPRING',           l2: 'LAYER 04/08 — FORCE',
    data: 'STEEL / 18MM / 45GF ACT / 62GF BOTTOM',
    head: ['The force that', 'always [ pushes ] back'] },
  { key: 'Solid 368', nav: 'CONTACT LEAVES',
    mode: 'CONTACT LEAVES',   l2: 'LAYER 05/08 — CONTACT',
    data: 'BRASS / 2 LEAVES / 5MS DEBOUNCE / 50M CYCLES',
    head: ['Where a press', 'becomes a [ signal ]'] },
  { key: 'Solid 87',  nav: 'BOTTOM HOUSING',
    mode: 'BOTTOM HOUSING',   l2: 'LAYER 06/08 — BASE',
    data: 'NYLON / 14 × 14MM / 1 CENTER POST / 5 PIN',
    head: ['The ground it', 'all [ stands ] on'] },
  // ⚠️ LED — piesă care în brief nu există. Textele sunt scrise de mine, în aceeași voce.
  { key: 'Solid 193', nav: 'LED',
    mode: 'LED',              l2: 'LAYER 07/08 — LIGHT',
    data: 'SMD / 3.5 × 2.8MM / 1 DIODE / 20MA FWD',
    head: ['The part that', 'only ever [ glows ]'] },
  // Textul „07 — Pins" din brief, mutat pe poziția reală a pinilor.
  { key: 'Solid 372', nav: 'PINS',
    mode: 'PINS',             l2: 'LAYER 08/08 — OUTPUT',
    data: 'COPPER / 2 PINS / 3.3MM / GOLD PLATED',
    head: ['Two small legs', 'that [ plug ] you in'] },
];
const PART_BY_KEY = {};
for (const p of PARTS) PART_BY_KEY[p.key] = p;

// ---------------------------------------------------------------- elementele de scris
const navEl  = document.getElementById('nav-section');
const hudEl  = document.getElementById('hud');
const l1El   = hudEl && hudEl.querySelector('[data-hud="l1"]');
const l2El   = hudEl && hudEl.querySelector('[data-hud="l2"]');
const l4El   = hudEl && hudEl.querySelector('[data-hud="l4"]');

// Scrie o secțiune întreagă. ⚠️ Toate cele patru texte pleacă din ACELAȘI loc, ca să nu
// existe două păreri despre unde ești. Linia 3 a HUD-ului (ALT/SPEED) nu e aici — ea curge
// continuu, vezi mai jos.
function applyText(t) {
  scramble(navEl, t.nav);
  scramble(l1El, t.l1);
  scramble(l2El, t.l2);
  scramble(l4El, t.l4);
}

// ⚠️ Starea de pornire se scrie DIN CONFIG, nu se lasă pe seama textului din HTML.
// Altfel cele două se pot depărta — și chiar s-au depărtat: după ce coordonatele au fost
// scoase din config, în pagină rămăsese linia veche, `COORD: [37.4412 N / …]`, și se vedea
// la FIECARE intrare pe site, până la primul eveniment de act (adică până termina
// preloaderul). Textul din HTML rămâne, dar doar ca stare inițială pentru cazul în care
// JS-ul nu pornește; adevărul e aici.
// ⚠️ Direct pe `textContent`, fără scramble: la pornire nu e o SCHIMBARE de secțiune, iar
// un amestec de litere pe un text care oricum nu se vede (conținutul e ascuns până la
// `is-ready`) ar fi doar risipă.
(function () {
  const t = HERO_TXT;
  if (navEl) navEl.textContent = t.nav;
  if (l1El) l1El.textContent = t.l1;
  if (l2El) l2El.textContent = t.l2;
  if (l4El) l4El.textContent = t.l4;
})();

// ------------------------------------------------- textul din stânga-jos
// „[ SCROLL TO EXPLORE ]" rămâne pe tot parcursul și devine semnătura studioului ABIA în
// footer, unde chiar e link. ⚠️ E ACELAȘI element: se schimbă doar textul (prin scramble,
// ca restul HUD-ului) și `href`-ul. Două elemente schimbate între ele ar fi însemnat două
// stări de ținut sincronizate.
const madeEl = document.getElementById('foot-made');
const MADE = 'MADE BY/ [ ATWWW ]';
const EXPLORE = '[ SCROLL TO EXPLORE ]';
const STUDIO = 'https://www.atwww.studio/';
let madeIsLink = false;

function setFootLink(link) {
  if (!madeEl || link === madeIsLink) return;
  madeIsLink = link;
  scramble(madeEl, link ? MADE : EXPLORE);
  if (link) { madeEl.href = STUDIO; madeEl.target = '_blank'; madeEl.rel = 'noopener'; }
  else madeEl.removeAttribute('href');   // fără href nu e link: nu primește focus, nu duce nicăieri
}

// Scramble la hover, cerut explicit. ⚠️ Doar când chiar e link: pe „[ SCROLL TO EXPLORE ]"
// nu ai ce să apeși, deci n-are ce semnala.
// ⚠️ `scramble` sare peste un text identic cu cel de pe ecran (altfel s-ar reporni singur
// la fiecare schimbare de secțiune), deci aici se cere apăsat, cu al treilea argument.
if (madeEl) {
  const din_nou = () => { if (madeIsLink) scramble(madeEl, MADE, true); };
  madeEl.addEventListener('mouseenter', din_nou);
  madeEl.addEventListener('focus', din_nou);
}

// ---------------------------------------------------------------- hover pe ABOUT
// Textul se amestecă, iar pătratul de lângă el trece la alb plin (aia e din CSS).
// ⚠️ Ascultătorul stă pe LINK, nu pe span: `mouseenter` pe textul din interior s-ar
// declanșa și când cursorul trece de pe pătrat pe litere, deci de două ori pe o singură
// intrare cu mouse-ul.
const aboutEl = document.querySelector('.nav__about');
const aboutT = aboutEl && aboutEl.querySelector('.nav__about-t');
if (aboutEl && aboutT) {
  const ABOUT = aboutT.textContent;
  const din_nou = () => scramble(aboutT, ABOUT, true);
  aboutEl.addEventListener('mouseenter', din_nou);
  aboutEl.addEventListener('focus', din_nou);
}

// ============================================================================
// TITLUL: intrare literă cu literă („intră în focus") și ieșire pe scroll
// ============================================================================
// Cerința userului, în ordine:
//   1. până nu trece preloaderul ȘI blurul de fundal, nu se vede niciun element de DOM;
//   2. atunci apar toate și își fac reveal-ul;
//   3. titlul intră cu litere blurate la întâmplare, ca și cum s-ar focaliza — exact
//      starea din PDF-urile din Figma, unde „s-ma" din *smallest* și „mac-h" din
//      *machine* sunt neclare (nu e o greșeală de machetă, e un cadru din animație);
//   4. scroll-ul e OPRIT până se termină animația titlului;
//   5. la scroll în jos titlul pleacă, la scroll înapoi sus se întoarce pe același drum.
//
// De ce blur și nu doar fade: e ACELAȘI vocabular ca reveal-ul scenei (30 px de blur
// care se limpezesc peste canvas, `INTRO_REVEAL` din `scene/index.js`) și ca bara de
// scanner de pe scrim, care descoperă desenele de sus în jos. Titlul face al treilea
// pas din aceeași mișcare: pagina intră în focus, apoi textul.
//
// ⚠️ Totul e în JS, nu în `@keyframes`, DEȘI intrarea singură ar fi încăput în CSS.
// Motivul: ieșirea e legată de scroll, deci trebuie oricum calculată pe valori. Ținute
// în două limbaje, cele două n-ar mai fi reversul una alteia — iar cerința 5 spune
// exact că trebuie să fie. Așa există o singură funcție de desen, `paintChar`, și
// singurul lucru care diferă e de unde vine progresul: din ceas sau din scroll.
// ⚠️ Și încă un motiv, cel care decide: o animație CSS cu `fill: forwards` bate stilul
// inline în cascadă (originea „animație" e peste cea de autor). Dacă intrarea rămânea
// în CSS, stilurile scrise de ieșire n-ar fi avut niciun efect până la ștergerea ei.

const HERO = {
  // ---- intrarea, în milisecunde ----
  hold:     40,   // ⚠️ aproape zero. Semnalul `keycap:ready` vine deja ÎNAINTE ca
                  // blurul scenei să se stingă de tot (vezi `READY_AT` în scenă), tocmai
                  // ca titlul să se focalizeze PESTE coada defocalizării, nu după ea.
  dur:     760,   // cât ține o literă
  stagger:  34,   // decalaj între litere, în ordinea citirii
  jitter:  220,   // cât din pornire e LA ÎNTÂMPLARE. Fără el, frontul e o linie dreaptă
                  // care mătură titlul și se citește ca o „mașină de scris". Cu el, la
                  // orice cadru sunt litere clare lângă litere încă neclare — adică
                  // starea din machetă.
  blurIn:   14,   // px de blur din care pornește o literă
  dyIn:   0.18,   // em, de unde vine (de jos)

  // ---- ieșirea, pe progresul actului de intro ----
  // 0.08 din trackul de intro. Trackul are 600vh, deci span-ul de scroll e 500vh:
  // titlul e complet plecat după ~40vh de derulare, adică sub o jumătate de ecran.
  outTo:  0.08,
  outWin: 0.55,   // cât din fereastră ocupă o singură literă (restul e decalaj)
  blurOut:  16,
  dyOut: -0.34,   // em, pleacă în SUS: scroll-ul duce pagina în sus, litera îl urmează
  lift:     70,   // px, cât se ridică tot blocul peste asta (mică paralaxă)
};

const heroEl = document.querySelector('.hero');
const h1El = document.querySelector('h1[data-split]');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;


const chars = h1El ? splitChars(h1El) : [];

const starts = chars.map((_, i) => HERO.hold + i * HERO.stagger + rnd(i) * HERO.jitter);
let inTotal = starts.length ? Math.max(...starts) + HERO.dur : 0;


// ------------------------------------------------- centrarea nav-ului pe coloana 3D
// Userul vrea „INFO SWITCH" centrat pe PIESELE switch-ului, nu pe ecran și nici pe nav.
// Nav-ul e `space-between`, deci centrul blocului din mijloc depinde de lungimea logo-ului
// și a blocului din dreapta — se nimerea aproape de centru, dar nu pe coloană. Iar coloana
// nici ea nu e în centrul ecranului: măsurat, cade la `centrul ecranului + 0.0041 x
// înălțimea ferestrei` (+3.7 px la 900, +5.9 px la 1440), pentru că e o cameră cu FOV
// vertical. Deci poziția nu se poate scrie în CSS; scena o trimite ca `keycap:anchor`.
//
// ⚠️ Deplasarea se face din MARGINI, nu din `transform` și nu trecând blocul pe
// `position: absolute`. Marginile sunt layout curat: `margin-right` primește minusul,
// deci lățimea totală a blocului nu se schimbă, spațiul liber împărțit de `space-between`
// rămâne același și NIMIC ALTCEVA nu se mișcă. Un `transform` fracționar ar fi mutat
// blocul pe strat de compozitare, unde textul se desenează mai moale (aceeași capcană ca
// la liniuțe, măsurată).
// ⚠️ `Math.round`: deplasarea intră în poziția liniuțelor, iar ele trebuie să rămână pe
// pixeli întregi. De aceea `snapTicks()` se recheamă imediat după.
const midEl = document.querySelector('.nav__mid');
let anchorX = null;

function placeNavMid() {
  if (!midEl || anchorX == null) return;
  midEl.style.marginLeft = '';
  midEl.style.marginRight = '';
  const r = midEl.getBoundingClientRect();
  const dx = Math.round(anchorX - (r.left + r.width / 2));
  if (dx) {
    midEl.style.marginLeft = dx + 'px';
    midEl.style.marginRight = -dx + 'px';
  }
  snapTicks();
}

addEventListener('keycap:anchor', (e) => { anchorX = e.detail.x; placeNavMid(); });
onScrambleIdle(placeNavMid);

// ---------------------------------------------------------------- fixarea pe pixel
// ⚠️ Un titlu care cade la `y = 387.5` se rasterizează pe jumătate de pixel și se vede
// ușor moale — permanent, fără nicio animație. Se întâmplă ori de câte ori fereastra are
// înălțime IMPARĂ, adică în jumătate din cazuri, și nu se rezolvă din CSS: și `top: 50%`
// și grila centrată împart la doi aceeași înălțime impară (măsurat: 387.50 în ambele).
// Într-o grilă centrată, `padding-top` mută conținutul cu JUMĂTATE din el, deci 1 px de
// padding duce `.5` la pixel întreg.
// ⚠️ Se recalculează la redimensionare: paritatea înălțimii se schimbă cu fereastra.
// ---------------------------------------------------------------- liniuțele din nav
// ⚠️ La scalări care NU sunt întregi (125% e implicit pe multe laptopuri Windows), o
// liniuță de 2 px CSS acoperă 2,5 pixeli de ecran. După unde cade marginea ei, se vede
// pe 3 sau pe 4 pixeli — de aici „sunt de dimensiuni diferite", deși în CSS au aceeași
// valoare. Măsurat pe dreptunghiul fiecărei liniuțe: la 100%, 150% și 200% toate ies
// IDENTICE, la 110%, 125%, 137.5% și 175% lățimea aparentă sare între 3 și 4 pixeli.
//
// Ca toate zece să se deseneze la fel, trei lucruri trebuie să cadă pe grila ecranului:
// LĂȚIMEA, PASUL (altfel fiecare liniuță din grup are altă fază) și ORIGINEA GRUPULUI
// (altfel cele două grupuri au faze diferite între ele).
//
// Măsurat pe GEOMETRIE (singurul lucru care nu depinde de rasterizare), împrăștierea
// fazei celor zece liniuțe pe grila ecranului și lățimea lor în pixeli de ecran:
//   DPR 1.1    fără: 0.897 px, lățime 2.20  ->  cu: 0.039 px, lățime 1.99
//   DPR 1.25   fără: 0.617 px, lățime 2.50  ->  cu: 0.059 px, lățime 2.99
//   DPR 1.375  fără: 0.871 px, lățime 2.75  ->  cu: 0.129 px, lățime 2.99
//   DPR 1.75   fără: 0.664 px, lățime 3.50  ->  cu: 0.055 px, lățime 3.99
// Adică: înainte porneau la faze răspândite pe aproape un pixel și aveau lățime
// fracționară, deci fiecare se rotunjea altfel; acum toate pornesc în aceeași fază și au
// un număr ÎNTREG de pixeli lățime. Restul de sub 0.13 px e cuantizarea internă a
// layoutului (1/64 px), nu mai e nimic de scos.
//
// ⚠️ Nu rulează deloc la scalări întregi: acolo măsurătoarea arată deja perfecțiune
// (lățimi identice, vârf identic), deci orice atingere ar fi doar risc.
// ⚠️ Corecția de origine se face din MARGINI, nu din `transform`: un `translateX`
// fracționar mută grupul pe strat de compozitare, unde browserul nu mai aliniază nimic —
// măsurat, acolo liniuța se întindea pe 2 pixeli cu vârf 55–65 în loc de 80.9.
// ⚠️ `margin-right` primește minusul, ca lățimea grupului să rămână aceeași: `.nav__mid`
// e așezat de `space-between`, deci un grup mai lat s-ar muta și corecția s-ar mușca de
// coadă.
// ⚠️ ASTA NU E VERIFICATĂ PE PIXELI, spre deosebire de restul fișierului. Chrome headless
// nu randează nativ la scalări fracționare: randează la 1.0 și mărește (se vede pe
// înălțimea liniuței — 6 pixeli la DPR 1, apoi 8 la 1.25, adică 6x1.25, nu 5.32x1.25).
// Deci harness-ul nu poate reproduce cazul. Dacă la 125% tot nu arată bine, funcția se
// scoate — nu are alt efect.
function snapTicks() {
  const groups = document.querySelectorAll('.ticks');
  if (!groups.length) return;
  const root = document.documentElement;
  for (const g of groups) { g.style.marginLeft = ''; g.style.marginRight = ''; }
  root.style.removeProperty('--tick-w-px');
  root.style.removeProperty('--tick-gap-px');
  root.style.removeProperty('--tick-h-px');
  const dpr = devicePixelRatio || 1;
  if (Number.isInteger(dpr)) return;
  const is = groups[0].children;
  if (is.length < 2) return;
  const dp = 1 / dpr;
  const snap = (v) => Math.max(dp, Math.round(v / dp) * dp);
  // Se citesc valorile FOLOSITE, nu tokenii: `--tick-w` e un `clamp(...)`, iar
  // `getComputedStyle` întoarce textul lui, nu rezultatul.
  const a = is[0].getBoundingClientRect();
  const b = is[1].getBoundingClientRect();
  const w = snap(a.width);
  const pitch = snap(b.left - a.left);
  root.style.setProperty('--tick-w-px', w.toFixed(4) + 'px');
  root.style.setProperty('--tick-gap-px', (pitch - w).toFixed(4) + 'px');
  root.style.setProperty('--tick-h-px', snap(a.height).toFixed(4) + 'px');
  for (const g of groups) {
    const l = g.getBoundingClientRect().left;
    const dx = Math.round(l / dp) * dp - l;
    if (Math.abs(dx) > 1e-4) {
      g.style.marginLeft = dx.toFixed(4) + 'px';
      g.style.marginRight = (-dx).toFixed(4) + 'px';
    }
  }
}

function snapHero() {
  if (!heroEl || !h1El) return;
  heroEl.style.paddingTop = '0px';
  const t = h1El.getBoundingClientRect().top;
  const frac = t - Math.floor(t);
  if (frac > 0.01) heroEl.style.paddingTop = (2 * (1 - frac)).toFixed(2) + 'px';
}
// ⚠️ Amândouă se recalculează la redimensionare: se schimbă și paritatea înălțimii, și
// `devicePixelRatio` (zoom-ul din browser îl mișcă, iar `resize` e evenimentul care vine).
function snapAll() { snapHero(); placeNavMid(); snapTicks(); watchDpr(); }

// ⚠️ Schimbarea de scalare (zoom din browser, mutarea ferestrei pe alt monitor) NU vine
// garantat ca `resize`: verificat în harness, după ce s-a schimbat `deviceScaleFactor`
// corecția rămăsese pe valoarea veche. Modul documentat de a o prinde e un
// `matchMedia` pe rezoluția CURENTĂ, care se declanșează exact când nu mai e adevărată;
// se re-abonează de fiecare dată, pentru că `dppx` de urmărit se schimbă odată cu ea.
// ⚠️ Cele două forme de abonare, pentru că Safari sub 14 NU are `addEventListener` pe un
// MediaQueryList, ci doar `addListener`. Fără garda asta, apelul aruncă `TypeError`, iar
// pe un modul asta nu e o eroare locală: EVALUAREA MODULULUI SE OPREȘTE, deci nu se mai
// înregistrează nici ascultătorul de `keycap:ready`. Rezultatul ar fi fost titlul care nu
// mai intră niciodată și scroll-ul deblocat abia de ceasul de siguranță de 5 s — adică o
// experiență ruptă, dintr-o linie care nu are nimic de-a face cu ea.
let dprMq = null;
function watchDpr() {
  if (dprMq) {
    if (dprMq.removeEventListener) dprMq.removeEventListener('change', snapAll);
    else if (dprMq.removeListener) dprMq.removeListener(snapAll);
  }
  dprMq = matchMedia('(resolution: ' + (devicePixelRatio || 1) + 'dppx)');
  if (dprMq.addEventListener) dprMq.addEventListener('change', snapAll);
  else if (dprMq.addListener) dprMq.addListener(snapAll);
}

addEventListener('resize', snapAll);
// Fonturile se încarcă asincron; până vin, cutiile au alte dimensiuni.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(snapAll);

// starea de plecare, scrisă ÎNAINTE ca `#content` să se aprindă: altfel, în cadrul în
// care se pune `is-ready`, titlul ar apărea o clipă întreg și clar
for (const el of chars) paintChar(el, 0, HERO.dyIn, HERO.blurIn);

// ---------------------------------------------------------------- intrarea
let introDone = false;
function finishIntro() {
  if (introDone) return;
  introDone = true;
  for (const el of chars) paintChar(el, 1, 0, 0);
  // Contractul înapoi spre scenă: de-abia acum se deblochează scroll-ul. Scena are și
  // un ceas de siguranță, ca pagina să nu rămână blocată dacă ceva de aici crapă.
  dispatchEvent(new CustomEvent('keycap:herodone'));
}

function runIntro() {
  if (REDUCED || !chars.length) { finishIntro(); return; }
  const t0 = performance.now();
  const step = (now) => {
    const t = now - t0;
    for (let i = 0; i < chars.length; i++) {
      const u = Math.min(1, Math.max(0, (t - starts[i]) / HERO.dur));
      paintChar(chars[i], u, HERO.dyIn, HERO.blurIn);
    }
    if (t < inTotal) requestAnimationFrame(step);
    else finishIntro();
  };
  requestAnimationFrame(step);
}

addEventListener('keycap:ready', runIntro, { once: true });

// ---------------------------------------------------------------- ieșirea, pe scroll
// ⚠️ Progresul NU se citește pe cont propriu (regula din capul fișierului). Scena îl
// trimite ca `keycap:progress`, din același loc în care decide actul curent — deci nu
// pot exista două păreri despre unde ești în pagină.
let outQ = -1;
function setOut(q) {
  q = Math.min(1, Math.max(0, q));
  if (!chars.length || Math.abs(q - outQ) < 1e-4) return;
  outQ = q;
  // decalajul pe litere se face în progres, nu în timp: fereastra fiecărei litere e
  // `outWin`, iar pornirile se împart pe restul
  const spread = 1 - HERO.outWin;
  const n = chars.length - 1 || 1;
  for (let i = 0; i < chars.length; i++) {
    const s0 = (i / n) * spread;
    const u = Math.min(1, Math.max(0, (q - s0) / HERO.outWin));
    paintChar(chars[i], 1 - u, HERO.dyOut, HERO.blurOut);
  }
  // ⚠️ Ridicarea blocului se rotunjește la PIXEL ÎNTREG. Cu zecimale, tot titlul stă pe
  // subpixel cât ține ieșirea și se vede moale; la q = 0 valoarea e ștearsă, deci starea
  // de repaus e oricum fără transform. (Din același motiv `.hero` nu mai e centrată cu
  // `translateY(-50%)` — vezi nota din `sections.css`.)
  if (heroEl) {
    const lift = Math.round(q * HERO.lift);
    heroEl.style.transform = lift ? 'translateY(-' + lift + 'px)' : '';
  }
}

addEventListener('keycap:progress', (e) => {
  if (!introDone) return;              // cât intră, scroll-ul e oricum blocat
  // În afara intro-ului titlul e plecat de mult; nu se recalculează nimic pe pași sau
  // pe outro, unde progresul curge pe alt track.
  const q = e.detail.name === 'intro' ? e.detail.p / HERO.outTo : 1;
  setOut(q);
});

// ============================================================================
// HEADING-UL PIESELOR, FOOTER-UL ȘI HUD-UL VIU
// ============================================================================


// „you ever [ touch ]" -> „you ever [ <b>touch</b> ]". Parantezele rămân la mărimea
// titlului, doar cuvântul dintre ele se micșorează — regula din machetă, aceeași ca la
// hero. ⚠️ `innerHTML` pe un șir din configul NOSTRU, nu din afară.
const markBrackets = (s) => s.replace(/\[\s*([^\]]+?)\s*\]/g, '[ <b>$1</b> ]');
const plainText = (s) => s.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- heading-ul pieselor
// UN SINGUR titlu pentru toate cele opt piese, care COBOARĂ odată cu scroll-ul și își
// schimbă textul la fiecare piesă.
//
// ⚠️ ANIMAȚIA E DECLANȘATĂ DE EVIDENȚIERE, NU CONDUSĂ DE SCROLL. Varianta dinainte lega
// claritatea literelor direct de plicul conturului: sincronizarea era perfectă, dar la o
// derulare de viteză normală plicul face tot drumul 0 → 1 → 0 în câteva zeci de
// milisecunde, deci nu se VEDEA nicio animație — titlul doar clipea. Acum schimbarea
// piesei (`keycap:step`, adică exact momentul în care sare conturul) pornește o animație
// cu durata ei, care arată la fel indiferent cât de repede derulezi.
//
// Forma ei: literele ies din focus TOATE ODATĂ și repede, textul se schimbă exact în
// punctul acela — invizibil — iar apoi intră literă cu literă, ca titlul din hero.
// ⚠️ Ieșirea NU e decalată pe litere, deși intrarea e. Cu decalaj, la momentul schimbului
// unele litere erau încă vizibile, iar schimbul se vedea ca un salt de text. Singurul
// moment în care se poate schimba textul e cel în care TOT titlul e stins.
// ⚠️ Și nu sunt două straturi suprapuse, ca într-o variantă anterioară: acolo, la mijlocul
// trecerii, două texte diferite stăteau unul peste altul la jumătate de opacitate și se
// citea ca un glitch.
const PART_OUT = { dur: 240, blur: 16, dy: -0.12 };
const PART_IN  = { dur: 620, stagger: 24, jitter: 150, blur: 14, dy: 0.16, to: 1 };
// ⚠️ Banda în care are voie să stea titlul. Prima piesă (keycap-ul) e SUS DE TOT, parțial
// peste marginea cadrului — măsurat, fără limită titlul ieșea la `top = -42`, adică tăiat.
const PART_SAFE = { sus: 96, jos: 120 };

const partEl = document.getElementById('part');
const partH = partEl && partEl.querySelector('h2');
let partChars = [], partKey = null, partBoxes = null, partCancel = null;

function partSetText(p) {
  partH.innerHTML = markBrackets(p.head[0]) + '<br>' + markBrackets(p.head[1]);
  partH.setAttribute('aria-label', plainText(p.head[0] + ' ' + p.head[1]));
  partChars = splitChars(partH);
  for (const c of partChars) paintChar(c, 0, PART_IN.dy, PART_IN.blur);
}

// Ieșirea din focus, fără decalaj: tot titlul se stinge deodată.
function partFade(chars, onDone) {
  const t0 = performance.now();
  let alive = true;
  const step = (now) => {
    if (!alive) return;
    const u = Math.min(1, (now - t0) / PART_OUT.dur);
    for (const c of chars) paintChar(c, 1 - u, PART_OUT.dy, PART_OUT.blur);
    if (u < 1) requestAnimationFrame(step);
    else { alive = false; if (onDone) onDone(); }
  };
  requestAnimationFrame(step);
  return () => { alive = false; };
}

// ⚠️ `top` se scrie în pixeli ÎNTREGI: titlul se mișcă în fiecare cadru, iar pe jumătate
// de pixel s-ar vedea moale tot drumul.
function placePart(y) {
  if (!partEl || y == null) return;
  const h = partH ? partH.getBoundingClientRect().height : 0;
  const min = PART_SAFE.sus;
  const max = Math.max(min, innerHeight - PART_SAFE.jos - h);
  partEl.style.top = Math.round(Math.min(max, Math.max(min, y - h / 2))) + 'px';
}

function showPart(p, box) {
  if (!partEl || !partH) return;
  partEl.classList.remove('is-off');
  if (box) placePart(box.y);
  if (p.key === partKey) return;
  partKey = p.key;
  if (partCancel) partCancel();
  const intra = () => {
    partSetText(p);
    if (box) placePart(box.y);          // textul nou poate avea altă înălțime
    partCancel = REDUCED ? null : focusAnim(partChars, PART_IN);
    if (REDUCED) for (const c of partChars) paintChar(c, 1, 0, 0);
  };
  // dacă e primul titlu din act, nu are ce să iasă
  if (partChars.length && !REDUCED) partCancel = partFade(partChars, intra);
  else intra();
}

function hidePart() {
  if (!partEl || !partKey) return;
  partKey = null;
  if (partCancel) partCancel();
  const gata = () => {
    for (const c of partChars) paintChar(c, 0, PART_IN.dy, PART_IN.blur);
    partEl.classList.add('is-off');
  };
  // ⚠️ La ieșirea din act titlul se stinge cu ACEEAȘI animație, nu dispare instantaneu.
  if (partChars.length && !REDUCED) partCancel = partFade(partChars, gata);
  else gata();
}

// Poziția rămâne legată de scroll — ea trebuie să urmeze piesa în fiecare cadru.
function partScroll(p) {
  if (!partEl || !partBoxes || !partBoxes.length) return;
  const n = partBoxes.length;
  // p = 0 e mijlocul primei felii, p = 1 mijlocul ultimei; între ele se interpolează
  const t = Math.min(n - 1, Math.max(0, p * n - 0.5));
  const i = Math.floor(t), f = t - i;
  const a = partBoxes[i], b = partBoxes[Math.min(n - 1, i + 1)];
  if (a && b) placePart(a.y + (b.y - a.y) * f);
}

// ---------------------------------------------------------------- footer-ul (outro)
// Titlul de footer NU e legat de niciun contur, deci aici animația e pe ceas, ca la hero.
const OUTRO_IN = { dur: 620, stagger: 24, jitter: 160, blur: 14, dy: 0.18, to: 1 };
// ⚠️ Titlul de footer NU mai intră la începutul actului de outro, ci abia când se vede
// câmpul de taste (cererea userului, 2026-09-24). Măsurat pe baleierea actului: la
// p = 0.40 câmpul e încă înghițit de ceață, la 0.55 e complet vizibil; pragul e între ele.
// `hide` e puțin sub `show`, ca la o derulare care se oprește fix pe prag titlul să nu
// intre și să iasă de la un cadru la altul.
const OUTRO_AT = { show: 0.5, hide: 0.47 };
const outroEl = document.getElementById('outro');
const outroH  = outroEl && outroEl.querySelector('h2');
const outroChars = outroH ? splitChars(outroH) : [];
let outroCancel = null, outroOn = false;
for (const el of outroChars) paintChar(el, 0, OUTRO_IN.dy, OUTRO_IN.blur);

function showOutro() {
  if (!outroEl || outroOn) return;
  outroOn = true;
  outroEl.classList.add('is-on');
  if (outroCancel) outroCancel();
  if (REDUCED) { for (const el of outroChars) paintChar(el, 1, 0, 0); return; }
  outroCancel = focusAnim(outroChars, OUTRO_IN);
}
function hideOutro() {
  if (!outroEl || !outroOn) return;
  outroOn = false;
  outroEl.classList.remove('is-on');
  if (outroCancel) outroCancel();
  for (const el of outroChars) paintChar(el, 0, OUTRO_IN.dy, OUTRO_IN.blur);
}

// ---------------------------------------------------------------- secțiunile
addEventListener('keycap:act', (e) => {
  const n = e.detail.name;
  if (n === 'intro') { applyText(HERO_TXT); hidePart(); hideOutro(); setFootLink(false); }
  else if (n === 'outro') { hidePart(); applyText(FOOT_TXT); setFootLink(true); }   // titlul: vezi OUTRO_AT
  else { hideOutro(); setFootLink(false); }   // 'steps' își scrie textele din `keycap:step`
});

addEventListener('keycap:step', (e) => {
  const d = e.detail;
  if (d.index < 0) return;          // ieșirea din actul de pași o tratează `keycap:act`
  const p = PART_BY_KEY[d.key] || PARTS[d.index];
  if (!p) return;
  if (d.boxes) partBoxes = d.boxes;   // pozițiile tuturor pieselor, pentru coborârea continuă
  applyText({ nav: p.nav, l1: 'SCAN MODE: ' + p.mode, l2: p.l2, l4: p.data });
  showPart(p, d.box);
});

// ---------------------------------------------------------------- HUD: ALT și SPEED
// Linia 3 nu trece niciodată prin scramble: se schimbă în fiecare cadru.
//   ALT   = cât ai coborât în pagină: 1.250M sus, 0M la capăt.
//   SPEED = cât de repede derulezi, netezit, din viteza lui Lenis.
// ⚠️ Nici progresul, nici viteza nu se citesc aici: vin din scenă, pe `keycap:progress`
// (regula din capul fișierului — un singur cititor de scroll).
// ⚠️ Ținta se stinge singură dacă nu mai vin evenimente: când Lenis încetinește, ultimele
// variații sunt sub pragul de emisie, deci fără asta SPEED ar rămâne înțepenit pe o
// valoare mică în loc să ajungă la 0.
const HUD = { altMax: 1250, speedFactor: 3, ease: 0.15, idleMs: 120 };
const altEl = document.querySelector('[data-hud="alt"]');
const speedEl = document.querySelector('[data-hud="speed"]');
const fmtMii = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
let hudTarget = 0, hudSpeed = 0, hudRaf = 0, hudSeenAt = 0, hudShown = -1;

function hudTick(now) {
  hudRaf = 0;
  if (now - hudSeenAt > HUD.idleMs) hudTarget = 0;
  hudSpeed += (hudTarget - hudSpeed) * HUD.ease;
  if (hudSpeed < 0.05 && hudTarget === 0) hudSpeed = 0;
  const v = Math.min(999, Math.round(hudSpeed));
  if (v !== hudShown && speedEl) { speedEl.textContent = String(v); hudShown = v; }
  if (hudSpeed !== 0 || hudTarget !== 0) hudRaf = requestAnimationFrame(hudTick);
}

addEventListener('keycap:progress', (e) => {
  const d = e.detail;
  if (d.name === 'steps') partScroll(d.p);
  if (d.name === 'outro') {
    if (d.p >= OUTRO_AT.show) showOutro();
    else if (d.p < OUTRO_AT.hide) hideOutro();
  } else hideOutro();
  if (altEl && typeof d.total === 'number') {
    altEl.textContent = fmtMii(Math.round(HUD.altMax * (1 - Math.min(1, Math.max(0, d.total)))));
  }
  hudTarget = Math.abs(d.v || 0) * HUD.speedFactor;
  hudSeenAt = performance.now();
  if (!hudRaf) hudRaf = requestAnimationFrame(hudTick);
});

// ============================================================================
// ABOUT — strat peste scenă, nu pagină separată
// ============================================================================
// Tot ce se vede se comută din CSS, pe `html.is-about` (vezi blocul ABOUT din
// `sections.css`). Aici stau doar lucrurile pe care CSS-ul nu le poate face:
//   · titlul, care intră literă cu literă, cu aceeași animație ca titlurile paginii;
//   · blocarea scroll-ului, cerută SCENEI prin `keycap:modal` — ea deține Lenis-ul;
//   · focusul și atributele de accesibilitate ale straturilor ascunse.
// ⚠️ Nu e rută (`/about`): scena rămâne încărcată dedesubt, iar la închidere te întorci
// exact unde erai, fără să se reîncarce nimic.
const ABOUT_IN = { dur: 620, stagger: 24, jitter: 160, blur: 14, dy: 0.18, to: 1, delay: 150 };
const aboutLayer = document.getElementById('about');
const aboutH = aboutLayer && aboutLayer.querySelector('h2[data-split]');
const aboutChars = aboutH ? splitChars(aboutH) : [];
for (const el of aboutChars) paintChar(el, 0, ABOUT_IN.dy, ABOUT_IN.blur);
// Straturile care primesc focus DOAR cât About e deschis (și invers).
const aboutFocus = document.querySelectorAll('[data-about-close], [data-social], #about-made');
const pageFocus = [madeEl];
let aboutOpen = false, aboutCancel = null;
// ⚠️ Focusul se mută DOAR când s-a ajuns aici de la tastatură. Mutat și după un clic de
// mouse, Chrome desenează inelul de focus pe ABOUT la închidere (măsurat în captură: un
// dreptunghi alb în jurul lui), deși nimeni n-a apăsat Tab.
let viaKey = false;
addEventListener('keydown', () => { viaKey = true; }, true);
addEventListener('pointerdown', () => { viaKey = false; }, true);

function setAbout(open) {
  if (!aboutLayer || open === aboutOpen) return;
  aboutOpen = open;
  document.documentElement.classList.toggle('is-about', open);
  aboutLayer.setAttribute('aria-hidden', String(!open));
  if (aboutEl) aboutEl.setAttribute('aria-expanded', String(open));
  for (const el of aboutFocus) el.tabIndex = open ? 0 : -1;
  // ⚠️ La închidere se ȘTERGE atributul, nu se pune 0: „[ SCROLL TO EXPLORE ]" e un <a>
  // fără href, iar cu `tabindex=0` ar fi primit focus deși nu duce nicăieri.
  for (const el of pageFocus) if (el) { if (open) el.tabIndex = -1; else el.removeAttribute('tabindex'); }
  dispatchEvent(new CustomEvent('keycap:modal', { detail: { open } }));
  if (aboutCancel) aboutCancel();
  if (open) {
    if (REDUCED) for (const el of aboutChars) paintChar(el, 1, 0, 0);
    else aboutCancel = focusAnim(aboutChars, ABOUT_IN);
    const back = document.querySelector('[data-about-close]');
    if (back && viaKey) back.focus({ preventScroll: true });
  } else {
    // ⚠️ La închidere literele se sting CU voalul (CSS, 600 ms), nu separat: altfel
    // titlul s-ar mai vedea o clipă peste scena care redevine clară.
    aboutCancel = REDUCED ? null : partFade(aboutChars, () => {
      for (const el of aboutChars) paintChar(el, 0, ABOUT_IN.dy, ABOUT_IN.blur);
    });
    if (REDUCED) for (const el of aboutChars) paintChar(el, 0, ABOUT_IN.dy, ABOUT_IN.blur);
    // focusul nu are voie să rămână pe un element care tocmai s-a ascuns
    const f = document.activeElement;
    if (f && f.closest && f.closest('[data-about-close], .foot__socials, .foot__legal')) {
      if (aboutEl && viaKey) aboutEl.focus({ preventScroll: true }); else f.blur();
    }
  }
}

if (aboutEl) aboutEl.addEventListener('click', (e) => { e.preventDefault(); setAbout(!aboutOpen); });
addEventListener('click', (e) => {
  if (e.target.closest('[data-about-close]')) { e.preventDefault(); setAbout(false); }
});
// ⚠️ Lenis oprit NU oprește tastele: săgețile, Space și PageDown derulează nativ. Cât e
// deschis About, se opresc aici — altfel scena s-ar mișca sub voal.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
addEventListener('keydown', (e) => {
  if (!aboutOpen) return;
  if (e.key === 'Escape') { setAbout(false); return; }
  if (SCROLL_KEYS.has(e.key) && !e.target.closest('button, a')) e.preventDefault();
});

// Semnătura din About: același hover și același scramble ca cea din footer.
// Pe socials doar hover-ul de culoare (din CSS), fără scramble — cererea userului.
// BACK: scramble pe text la hover, ca ABOUT. ⚠️ Pe span-ul din buton, nu pe buton:
// `textContent` pe buton ar șterge și săgeata SVG de lângă.
const backEl = document.querySelector('.nav__back');
const backT = backEl && backEl.querySelector('.nav__back-t');
if (backEl && backT) {
  const BACK = backT.textContent;
  const din_nou = () => scramble(backT, BACK, true);
  backEl.addEventListener('mouseenter', din_nou);
  backEl.addEventListener('focus', din_nou);
}

const aboutMade = document.getElementById('about-made');
if (aboutMade) {
  const din_nou = () => scramble(aboutMade, MADE, true);
  aboutMade.addEventListener('mouseenter', din_nou);
  aboutMade.addEventListener('focus', din_nou);
}

// ---------------------------------------------------------------- punte de reglaj
// Aceleași reguli ca la `__dbg` din scenă: fiecare valoare nouă trebuie să se poată
// mătura din harness, fără reîncărcare.
// ⚠️ `replay()` REPORNEȘTE de la constantele din `HERO` (recalculează pornirile), deci
// o valoare schimbată din consolă chiar se vede. Scrisă direct pe litere, n-ar fi ținut
// un cadru — vezi capcana `setInk` din `__dbg`.
if (new URLSearchParams(location.search).has('dbg')) {
  window.__ui = {
    HERO, chars, PART_IN, PART_OUT, PART_SAFE, OUTRO_IN, HUD, PARTS, ABOUT_IN, OUTRO_AT,
    setAbout, get aboutOpen() { return aboutOpen; },
    get partBoxes() { return partBoxes; },
    get outroOn() { return outroOn; },
    get partTop() { return partEl && partEl.style.top; },
    get q() { return outQ; },
    setOut,
    // ⚠️ Pictează intrarea la un moment ALES, fără să aștepte ceasul. Există pentru că
    // în `headless=new` rAF nu produce cadre cât timp pagina nu e în prim-plan: prima
    // chemare vine cu `t` deja peste durata totală, deci orice captură prinde titlul
    // gata așezat și nu se poate vedea starea din mijloc, adică exact ce e de verificat.
    setIn: (t) => {
      for (let i = 0; i < chars.length; i++) {
        const u = Math.min(1, Math.max(0, (t - starts[i]) / HERO.dur));
        paintChar(chars[i], u, HERO.dyIn, HERO.blurIn);
      }
    },
    get inTotal() { return inTotal; },
    replay: () => {
      introDone = false;
      for (let i = 0; i < chars.length; i++)
        starts[i] = HERO.hold + i * HERO.stagger + rnd(i) * HERO.jitter;
      inTotal = starts.length ? Math.max(...starts) + HERO.dur : 0;
      runIntro();
    },
    state: () => chars.map((c) => ({
      ch: c.textContent,
      op: getComputedStyle(c).opacity,
      f: getComputedStyle(c).filter,
    })),
  };
}

// ⚠️ Prima așezare se face ABIA AICI, la capătul modulului, nu lângă definiții. Ordinea
// contează: `snapAll()` citește layoutul, iar dacă ar arunca (un browser mai vechi, o
// proprietate lipsă), tot ce urmează în modul n-ar mai fi executat — inclusiv
// `addEventListener('keycap:ready', ...)`, adică singurul lucru care pornește titlul și,
// prin `keycap:herodone`, deblochează scroll-ul. Contractul cu scena se leagă primul,
// măsurătorile de pixeli vin după.
snapAll();
