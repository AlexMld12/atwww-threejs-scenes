// Liniuțele celor 4 etape din header-ul analizei — aceeași problemă și aceeași rezolvare
// ca bara din header-ul home-ului (src/ui/ticks.js): macheta le dă 4 px la pas de 6.305,
// adică pe fracțiuni de pixel; desenate așa, ies de lățimi și distanțe diferite. Lățimea,
// pasul, înălțimea și lungimea se rotunjesc la pixeli întregi de ECRAN și se scriu în
// `--tk-*`; câte încap se calculează din lungimea rotunjită.
//
// Progresul unei etape (0…1) se aprinde ÎNTREG, liniuță cu liniuță, animat în timp:
// `--lit` urcă/coboară un pas pe cadru-timp (STEP_MS), ca un contor.
const STEP_MS = 14;

export function initStageTicks(stagesEl) {
  const bars = [...stagesEl.querySelectorAll('.sa-ticks')];
  const state = bars.map(() => ({ total: 0, lit: 0, target: 0, frac: 0, raf: 0 }));

  const resolve = (token) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(${token})`;
    stagesEl.appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  };

  function measure() {
    // ascuns (home-ul e pagina) → lățimi zero; se reia la intrare (`refresh`)
    if (!stagesEl.offsetWidth) return;
    const dpr = devicePixelRatio || 1;
    const snap = (v) => Math.max(1, Math.round(v * dpr)) / dpr;
    const w = snap(resolve('--sa-tick-w'));
    const p = snap(resolve('--sa-tick-pitch'));
    const h = snap(resolve('--sa-tick-h'));
    bars.forEach((el, i) => {
      const len = Math.floor(el.parentElement.getBoundingClientRect().width * dpr) / dpr;
      el.style.setProperty('--tk-w', `${w}px`);
      el.style.setProperty('--tk-p', `${p}px`);
      el.style.setProperty('--tk-h', `${h}px`);
      el.style.setProperty('--tk-len', `${len}px`);
      const s = state[i];
      s.total = Math.floor((len - w) / p) + 1;
      s.target = Math.round(s.frac * s.total);
      s.lit = s.target;
      el.style.setProperty('--lit', s.lit);
    });
  }
  addEventListener('resize', measure);

  function animate(i) {
    const s = state[i];
    cancelAnimationFrame(s.raf);
    let last = performance.now();
    const tick = (now) => {
      const n = Math.floor((now - last) / STEP_MS);
      if (n > 0) {
        last += n * STEP_MS;
        s.lit += Math.sign(s.target - s.lit) * Math.min(n, Math.abs(s.target - s.lit));
        bars[i].style.setProperty('--lit', s.lit);
      }
      if (s.lit !== s.target) s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  }

  return {
    refresh: measure,
    // fracs: 4 valori 0…1; `instant` = fără contor (intrarea directă, refacerea)
    set(fracs, instant = false) {
      fracs.forEach((f, i) => {
        const s = state[i];
        s.frac = f;
        s.target = Math.round(f * s.total);
        if (instant) {
          cancelAnimationFrame(s.raf);
          s.lit = s.target;
          bars[i].style.setProperty('--lit', s.lit);
        } else if (s.lit !== s.target) animate(i);
      });
    },
  };
}
