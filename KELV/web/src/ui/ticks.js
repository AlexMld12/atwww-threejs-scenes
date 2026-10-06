// Bara de liniuțe din header = progresul pe tot site-ul (cererea userului, 2026-10-05):
// în vârful paginii nicio liniuță aprinsă, la capătul footer-ului toate.
// Se aprind ÎNTREGI, una câte una (nu o bară care taie o liniuță pe jumătate):
// `--ticks-lit` e un număr întreg, iar header.css îl înmulțește cu pasul.
//
// ⚠️ ALINIEREA PE GRILA ECRANULUI — de ce există `snap()` (vezi și nota din header.css).
// Macheta dă liniuțe de 1.5 px la pas de 6.5 px. Pe ecran, asta cade pe jumătăți de
// pixel: măsurat pe captură la DPR 1, liniuțele ieșeau alternativ de 1 și 2 pixeli. La
// scalările fracționare de Windows (125%, 150%) se strică altfel, dar tot inegal — ce
// vedea userul pe live. Ca TOATE să se deseneze la fel trebuie să cadă pe pixeli întregi
// de ECRAN (nu CSS): lățimea, pasul (altfel fiecare liniuță are altă fază), înălțimea și
// originea barei. Ideea vine din SUBKEY (`snapTicks` din keycap_dimension/web/src/ui).
// Spre deosebire de SUBKEY, aici rulează și la DPR întreg: la 1.5 px nici 100% nu e curat.
// Rotunjirea: 1.5 → 2 px și 6.5 → 7 px la DPR 1 (golul rămâne 5, ca în machetă);
// la DPR 1.25: 1.6 / 6.4 CSS px = 2 / 8 pixeli de ecran.
export function initTicks(scroll) {
  // două bare: a stratului alb și a clonei închise (chrome.js) — măsurate pe prima,
  // aceleași valori scrise pe amândouă
  const bars = [...document.querySelectorAll('.ticks')];
  const bar = bars[0];
  if (!bar) return;
  const header = bar.parentElement;

  // Tokenii sunt `clamp(...)`; `getComputedStyle` ar întoarce textul lor, nu valoarea.
  // Se rezolvă printr-o sondă în header (care NU e aliniată de noi, deci nu se citește
  // înapoi o valoare deja rotunjită).
  const resolve = (token) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(${token})`;
    header.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  };

  let total = 0, last = -1;
  function measure() {
    const dpr = devicePixelRatio || 1;
    // la cel puțin un pixel de ecran — o liniuță de 0 pixeli ar dispărea
    const snap = (v) => Math.max(1, Math.round(v * dpr)) / dpr;
    const pad = resolve('--pad-edge');
    const w = snap(resolve('--tick-w'));
    const p = snap(resolve('--tick-pitch'));
    const h = snap(resolve('--tick-h'));
    const x = snap(pad);
    // lungimea: de la x până la (lățimea paginii − pad), coborâtă la un pixel întreg
    const len = Math.floor((document.documentElement.clientWidth - pad - x) * dpr) / dpr;
    for (const el of bars) {
      const s = el.style;
      s.setProperty('--tk-w', `${w}px`);
      s.setProperty('--tk-p', `${p}px`);
      s.setProperty('--tk-h', `${h}px`);
      s.setProperty('--tk-x', `${x}px`);
      s.setProperty('--tk-y', `${x}px`);
      s.setProperty('--tk-len', `${len}px`);
    }
    // câte încap: ultima începe la (n−1)·pas și trebuie să se termine în bară
    total = Math.floor((len - w) / p) + 1;
    last = -1;
  }
  measure();
  addEventListener('resize', measure);
  // schimbarea scalării (zoom în browser, mutarea ferestrei pe alt monitor) nu dă
  // întotdeauna `resize`, dar schimbă `devicePixelRatio`
  const watchDpr = () => {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
      measure();
      watchDpr();
    }, { once: true });
  };
  watchDpr();

  scroll.onFrame(() => {
    // ⚠️ fără secțiunea buclei (copia hero-ului de după footer): bara e plină când footer-ul
    // umple ecranul, ca pe drinksom (`scrollHeight − vh − footer-hero-loop`)
    const loop = document.querySelector('[data-loop]');
    const max = document.documentElement.scrollHeight - innerHeight - (loop ? loop.offsetHeight : 0);
    const prog = max > 0 ? Math.min(1, Math.max(0, scroll.y / max)) : 0;
    const lit = Math.round(prog * total);
    if (lit === last) return;
    last = lit;
    for (const el of bars) el.style.setProperty('--ticks-lit', lit);
  });
}
