// Stratul fix (header + CTA-uri) în două variante, ca schimbarea de culoare pe fundal
// deschis să se facă PE PIXEL (vezi nota din header.css).
//
//   · `.chrome` (originalul, alb) — decupat cu un poligon care exclude banda deschisă;
//   · `.chrome--dark` (clona, #17110F) — decupată exact pe banda deschisă.
// Banda = intersecția secțiunilor `[data-theme="light"]` cu ecranul, scrisă în fiecare
// cadru în `--lb-a` / `--lb-b`.
//
// ⚠️ initChrome() rulează ÎNAINTEA lui initHovers / initTicks: clona trebuie să existe
// când acelea își caută elementele (literele rulate, sublinierile, bara de liniuțe), ca
// ambele variante să fie animate la fel. Ascultătorii de evenimente nu se copiază la
// clonare — de aceea ordinea, nu o a doua inițializare.
export function initChrome(scroll) {
  const chrome = document.querySelector('[data-chrome]');
  if (!chrome) return;
  const dark = chrome.cloneNode(true);
  dark.classList.add('chrome--dark');
  dark.removeAttribute('data-chrome');
  dark.setAttribute('aria-hidden', 'true');
  // linkurile copiei rămân CLICABILE (pe banda deschisă originalul e decupat, deci nu mai
  // primește click-uri), dar ies din ordinea de tab — altfel fiecare link ar apărea de 2 ori
  dark.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
  chrome.after(dark);

  const root = document.documentElement;
  let lastA = -1, lastB = -1;
  scroll.onFrame(() => {
    const vh = innerHeight;
    // banda = REUNIUNEA zonelor deschise de pe ecran (secțiunile 7 și 8 sunt lipite, deci
    // banda e continuă). `data-theme-end` = până unde e deschisă secțiunea, ca fracție din
    // înălțime (zona 8 e un gradient: deschis până la 0.76, vezi tools/extract_footer.py).
    let a = Infinity, b = -Infinity;
    for (const s of document.querySelectorAll('[data-theme="light"]')) {
      const r = s.getBoundingClientRect();
      const end = r.top + r.height * (parseFloat(s.dataset.themeEnd) || 1);
      const top = Math.max(0, r.top), bottom = Math.min(vh, end);
      if (bottom > top) { a = Math.min(a, top); b = Math.max(b, bottom); }
    }
    if (a === Infinity) { a = 0; b = 0; }
    if (a !== lastA || b !== lastB) {
      lastA = a; lastB = b;
      root.style.setProperty('--lb-a', `${a.toFixed(2)}px`);
      root.style.setProperty('--lb-b', `${b.toFixed(2)}px`);
    }
  });
}
