// Efectele de text comune paginii principale și paginii de 404: scramble-ul și intrarea
// literă cu literă („intră în focus").
// ⚠️ Sunt AICI, nu în `ui/index.js`, pentru că acel modul are efecte la import (leagă
// ascultătorii scenei, măsoară nav-ul, pornește titlul). 404-ul are nevoie doar de
// unelte, nu de toată pagina.

// ---------------------------------------------------------------- scramble
// Textul nu se schimbă brusc: literele se amestecă și se așază pe rând, de la stânga la
// dreapta. Userul a cerut explicit efectul ăsta pentru blocul de info.
//
// ⚠️ Se păstrează SPAȚIILE ȘI NEWLINE-URILE neatinse. Amestecate și ele, blocul își
// schimbă forma la fiecare cadru și sare tot layoutul din jur.
// ⚠️ Un singur `setInterval` pentru tot, nu unul pe element: altfel două texte care se
// schimbă în același timp bat unul în altul și consumă două tick-uri pe cadru.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/[]<>-·';
const jobs = new Map();          // element -> { to, frame }
let timer = null;
let onIdle = null;
export function onScrambleIdle(fn) { onIdle = fn; }

function tick() {
  for (const [el, job] of jobs) {
    const { to } = job;
    let out = '';
    let done = true;
    for (let i = 0; i < to.length; i++) {
      const c = to[i];
      if (c === ' ' || c === '\n') { out += c; continue; }
      // câte 2 caractere se fixează la fiecare cadru — la 1 e prea lent pe blocul
      // de patru rânduri din dreapta-jos, la 4 nici nu apuci să vezi amestecul
      if (i < job.frame * 2) { out += c; continue; }
      done = false;
      out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    job.frame++;
    if (done) jobs.delete(el);
  }
  if (!jobs.size) {
    clearInterval(timer); timer = null;
    // ⚠️ Textul din mijlocul nav-ului își poate schimba lățimea, deci pagina principală
    // își recentrează aici blocul pe coloană (`placeNavMid`, prin `onScrambleIdle`).
    if (onIdle) onIdle();
  }
}

export function scramble(el, text, force) {
  if (!el || (el.textContent === text && !force)) return;
  jobs.set(el, { to: text, frame: 0 });
  if (!timer) timer = setInterval(tick, 1000 / 30);
}

// ---------------------------------------------------------------- spargerea în litere
// ⚠️ Se merge pe NODURILE DE TEXT, nu pe `innerHTML`: `<b>` (cuvântul mai mic dintre
// paranteze) și `<br>` trebuie să rămână exact unde sunt. O rescriere de `innerHTML` ar
// fi trebuit să le reconstruiască, iar mărimea din `h1 b` s-ar fi pierdut.
// ⚠️ Spațiile NU se împachetează. Un spațiu într-un `inline-block` nu mai e loc de rupt
// rândul, deci titlul n-ar mai putea niciodată să se împartă altfel decât din `<br>`.
export function splitChars(root) {
  const out = [];
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const c of child.nodeValue) {
          if (c === ' ' || c === '\n') { frag.appendChild(document.createTextNode(c)); continue; }
          const s = document.createElement('span');
          s.className = 'ch';
          s.textContent = c;
          s.setAttribute('aria-hidden', 'true');   // numele accesibil vine din aria-label
          frag.appendChild(s);
          out.push(s);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

// Partea la întâmplare a pornirii. ⚠️ Hash pe indice, nu `Math.random()`: la fiecare
// reîncărcare trebuie să iasă ACELAȘI tipar, altfel nu se poate măsura de două ori la
// fel și nici nu se poate compara o captură cu alta.
export const rnd = (i) => { const x = Math.sin((i + 1) * 12.9898) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- desenul unei litere
// `s` = cât de CLARĂ e litera, 0 (invizibilă, topită) → 1 (așezată). Aceeași funcție
// pentru intrare și pentru ieșire; doar sensul deplasării diferă.
// ⚠️ Opacitatea ajunge la 1 mai devreme decât blurul (s/0.6): litera se vede ÎNCĂ
// neclară, apoi se focalizează. Dacă merg împreună, efectul se citește ca un simplu
// fade și dispare tocmai lucrul cerut.
export function paintChar(el, s, dyEm, blurPx) {
  const e = 1 - Math.pow(1 - s, 3);
  el.style.opacity = s >= 1 ? '' : Math.min(1, s / 0.6).toFixed(3);
  const b = (1 - e) * blurPx;
  el.style.filter = b > 0.05 ? 'blur(' + b.toFixed(2) + 'px)' : '';
  const d = (1 - e) * dyEm;
  el.style.transform = Math.abs(d) > 5e-4 ? 'translateY(' + d.toFixed(4) + 'em)' : '';
}

// Aceeași animație ca la titlul din hero, dar refolosibilă: se cheamă de opt ori, pe
// texte diferite. Întoarce o funcție de ANULARE — dacă userul derulează repede, pasul
// următor trebuie să poată tăia scurt animația celui dinainte.
// ⚠️ Hero-ul NU folosește funcția asta, deși ar încăpea. Bucla lui e calibrată și
// măsurată (16 litere clare lângă 10 în focalizare la mijloc), iar `__ui.setIn` se
// bazează pe tabelul ei de porniri. Nu se rescrie ce e deja verificat, doar ca să fie
// „un singur loc".
export function focusAnim(chars, o) {
  const starts = chars.map((_, i) => (o.delay || 0) + i * o.stagger + rnd(i) * o.jitter);
  const total = (starts.length ? Math.max(...starts) : 0) + o.dur;
  const t0 = performance.now();
  let alive = true;
  const step = (now) => {
    if (!alive) return;
    const t = now - t0;
    for (let i = 0; i < chars.length; i++) {
      const u = Math.min(1, Math.max(0, (t - starts[i]) / o.dur));
      paintChar(chars[i], o.to === 0 ? 1 - u : u, o.dy, o.blur);
    }
    if (t < total) requestAnimationFrame(step);
    else { alive = false; if (o.onDone) o.onDone(); }
  };
  requestAnimationFrame(step);
  return () => { alive = false; };
}
