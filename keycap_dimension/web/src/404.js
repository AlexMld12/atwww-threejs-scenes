// Pagina de 404. Fără three, fără Lenis, fără preloader: doar DOM-ul comun (nav, colțuri)
// și efectele de text ale paginii principale, din `ui/fx.js`.
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/404.css';
import { scramble, splitChars, paintChar, focusAnim } from './ui/fx.js';
// `?raw`: SVG-ul intră în pagină ca markup, nu ca <img>, ca să i se poată mișca
// keycap-ul separat de restul switch-ului și să i se schimbe culoarea din CSS.
import switchSvg from './assets/switch-closed.svg?raw';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- desenul
const draw = document.getElementById('nf-draw');
if (draw) {
  draw.insertAdjacentHTML('afterbegin', switchSvg);
  const svg = draw.querySelector('svg');
  // ⚠️ Cutia se mărește în SUS: keycap-ul se ridică deasupra switch-ului, iar cu
  // `viewBox`-ul original ar fi fost tăiat. 170 de unități = ridicarea + plutirea.
  const [x, y, w, h] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  svg.setAttribute('viewBox', [x, y - 170, w, h + 170].join(' '));
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.removeAttribute('role'); svg.removeAttribute('aria-label');
  // Umbra keycap-ului: aceeași formă, rămasă la locul ei, abia vizibilă — ca să se vadă
  // DE UNDE a sărit. Clona pierde `id`-ul, deci nu primește și animația de plutire.
  const cap = svg.querySelector('#p8_keycap');
  if (cap) {
    const ghost = cap.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.setAttribute('class', 'nf__ghost');
    cap.before(ghost);
  }
}

// ---------------------------------------------------------------- GO BACK
// Înapoi în istorie DOAR dacă vii de pe site; altfel (link din afară, adresă tastată)
// `history.back()` te-ar scoate de tot, deci duce acasă.
const goBack = document.querySelector('[data-go-back]');
if (goBack) goBack.addEventListener('click', (e) => {
  let sameSite = false;
  try { sameSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
  if (sameSite && history.length > 1) { e.preventDefault(); history.back(); }
});

// ---------------------------------------------------------------- scramble la hover
// Aceeași regulă ca pe pagina principală: textele-buton se amestecă, link-urile de
// socials doar își schimbă culoarea (din CSS).
for (const [sel, tsel] of [['.nav__about', '.nav__about-t'], ['.nf__cta', '.nf__cta-t']]) {
  const el = document.querySelector(sel);
  const t = el && el.querySelector(tsel);
  if (!t) continue;
  const txt = t.textContent;
  const din_nou = () => scramble(t, txt, true);
  el.addEventListener('mouseenter', din_nou);
  el.addEventListener('focus', din_nou);
}

// ---------------------------------------------------------------- intrarea
// Aceleași mișcări ca la intrarea pe site: nav-ul și colțurile ies din blur (CSS,
// `piece-in`, pornit de `is-ready`), titlul intră literă cu literă, HUD-ul și textul din
// mijlocul nav-ului se amestecă.
const IN = { dur: 760, stagger: 34, jitter: 220, blur: 14, dy: 0.18, to: 1, delay: 120 };
const h1 = document.querySelector('.nf h1[data-split]');
const chars = h1 ? splitChars(h1) : [];
for (const c of chars) paintChar(c, REDUCED ? 1 : 0, IN.dy, IN.blur);

document.documentElement.classList.add('is-ready');
if (!REDUCED) {
  focusAnim(chars, IN);
  const sc = [document.getElementById('nav-section'), ...document.querySelectorAll('#hud p')];
  for (const el of sc) if (el) scramble(el, el.textContent, true);
}
