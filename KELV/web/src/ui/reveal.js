// Reveal-ul textelor. Două efecte (cererile userului, 2026-10-05 / 06):
//
//  · implicit — PARAGRAFE, RÂND CU RÂND (`data-reveal-lines`): fiecare rând pornește
//    „nefocalizat" (blurat, puțin micșorat, mai jos) și se așază. Modelul e drinksom.eu:
//    `{opacity: 0, y: 30, blur(4px)}` → vizibil, 0.8 s, ease [.76, 0, .24, 1]; scale-ul
//    e al userului. Decalajul dintre rânduri, 0.07 s, e cel al rândurilor de titlu de la
//    ei (`.left-title-line`, stagger 0.07).
//  · `data-reveal-fx="blur"` — TITLUL MARE: DOAR blur → clar, fără mișcare, fără scale,
//    fără opacitate. A-ul și S-ul din ALWAYS rămân blurate (au blur-ul lor, separat).
//    ⚠️ Rândul se blurează întreg, nu literă cu literă: spart în <span>-uri pe litere,
//    browserul ar pierde kerning-ul dintre ele, iar lățimile rândurilor au fost reglate
//    CU kerning (diferența era ~19 px pe STATE OF MIND).
//
// Se declanșează o singură dată, când elementul intră în ecran (prag 10%, ca la ei).
// Întârzierea de pornire a elementului: `data-reveal="<secunde>"`.
//
// ⚠️ ORDINEA DE PORNIRE contează (bug raportat de user: primul paragraf „nu avea
// animație"). Ce e în primul ecran se intersecta imediat, deci primea `.is-in` în
// ACELAȘI cadru în care apărea și starea ascunsă — browserul nu desena niciodată starea
// de pornire, deci nu era nimic de animat. Acum `startReveals()` se cheamă abia după ce
// pagina e vizibilă (main.js: CSS + fonturi), și observarea începe după încă DOUĂ cadre:
// primul desenează starea ascunsă, abia al doilea o poate schimba.
const LINE_STAGGER = 0.07;

// Sparge un paragraf în rânduri, așa cum le așază browserul acum. Cuvintele se măsoară
// după `offsetTop`; fiecare rând devine un <span class="rv-line"> bloc. Textul original
// rămâne în `data-text`, ca re-spargerea la redimensionare să plece mereu de la el.
function splitLines(el) {
  const text = el.dataset.text ?? el.textContent.trim().replace(/\s+/g, ' ');
  el.dataset.text = text;
  el.textContent = '';
  const words = text.split(' ').map((w) => {
    const s = document.createElement('span');
    s.textContent = w;
    s.style.display = 'inline-block';
    el.append(s, ' ');
    return s;
  });
  const lines = [];
  let top = null;
  for (const w of words) {
    if (w.offsetTop !== top) { lines.push([]); top = w.offsetTop; }
    lines[lines.length - 1].push(w.textContent);
  }
  el.textContent = '';
  return lines.map((ws) => {
    const l = document.createElement('span');
    l.className = 'rv-line';
    l.textContent = ws.join(' ');
    el.appendChild(l);
    return l;
  });
}

export function startReveals() {
  const hosts = [...document.querySelectorAll('[data-reveal]')];
  if (!hosts.length) return;

  // țintele animate ale fiecărui host: rândurile lui, sau el însuși
  const targets = new Map();
  function prepare(host, done) {
    const base = parseFloat(host.dataset.reveal) || 0;
    let list;
    if (host.hasAttribute('data-reveal-lines')) {
      list = splitLines(host);
      list.forEach((l, i) => l.style.setProperty('--rv-delay', `${base + i * LINE_STAGGER}s`));
    } else {
      list = [host];
      host.style.setProperty('--rv-delay', `${base}s`);
    }
    for (const t of list) {
      t.classList.add('rv');
      if (host.dataset.revealFx === 'blur') t.classList.add('rv--blur');
      if (done) t.classList.add('is-in');
    }
    targets.set(host, list);
    host.classList.add('rv-ready');
  }
  hosts.forEach((h) => prepare(h, false));

  // la redimensionare rândurile se pot rearanja: re-sparge, păstrând starea (fără să
  // reanimeze ce s-a văzut deja)
  let rt;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      for (const h of hosts) {
        if (!h.hasAttribute('data-reveal-lines')) continue;
        const shown = targets.get(h)?.[0]?.classList.contains('is-in');
        prepare(h, shown);
      }
    }, 150);
  });

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const t of targets.get(e.target) || []) t.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { threshold: 0.1 });
  requestAnimationFrame(() => requestAnimationFrame(() => hosts.forEach((h) => io.observe(h))));
}
