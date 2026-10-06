// Animațiile de hover, copiate din drinksom.eu (citite din codul lor, 2026-10-05).

// ---- JOIN CLUB / BUY NOW: sublinierea „măturată" ----
// La ei: `navUnderlineSweep`, 900 ms ease-in-out, pornit pe `mouseenter` / `focus`.
// Animația rulează ÎNTREAGĂ și la ieșirea mouse-ului (nu e un :hover care se întoarce),
// iar o nouă intrare o repornește de la capăt — de aici scoaterea clasei + un cadru
// gol înainte s-o pună la loc (fără el, browserul nu repornește aceeași animație).
// Keyframe-urile sunt în ui.css.
function initUnderlines() {
  for (const link of document.querySelectorAll('[data-sweep]')) {
    const line = link.querySelector('.cta__line');
    if (!line) continue;
    const play = () => {
      line.classList.remove('is-sweeping');
      requestAnimationFrame(() => line.classList.add('is-sweeping'));
    };
    link.addEventListener('mouseenter', play);
    link.addEventListener('focus', play);
    line.addEventListener('animationend', () => line.classList.remove('is-sweeping'));
  }
}

// ---- OPEN SHOP: textul literă cu literă ----
// La ei textul urcă întreg (două copii suprapuse, `y: -100%`, 0.4 s, ease [.95,0,.05,1]).
// Cererea userului: LITERĂ CU LITERĂ, ca un val de la ultima literă spre prima (decalajul
// e `--roll-stagger` din ui.css), și invers la ieșire (valul se întoarce de la prima).
// Fiecare literă devine o coloană cu două copii; CSS-ul o urcă cu o copie (ui.css →
// `.roll`). `--i` = indexul literei, `--ri` = indexul invers; hover-ul folosește `--ri`.
// Exportată: pagina Skin Analysis își desenează butoanele din JS și le trece prin aceeași
// funcție (`root` = ecranul nou). `data-rolled` = deja spart, ca a doua trecere să nu-l
// spargă din nou.
export function initRolls(root = document) {
  for (const el of root.querySelectorAll('[data-roll]:not([data-rolled])')) {
    el.dataset.rolled = '';
    const text = el.textContent.trim();
    el.textContent = '';
    el.setAttribute('aria-hidden', 'true');
    const n = text.length;
    [...text].forEach((ch, i) => {
      const c = document.createElement('span');
      c.className = 'roll__ch';
      c.style.setProperty('--i', i);
      c.style.setProperty('--ri', n - 1 - i);
      const glyph = ch === ' ' ? ' ' : ch;
      c.innerHTML = `<span>${glyph}</span><span>${glyph}</span>`;
      el.appendChild(c);
    });
    // textul accesibil rămâne întreg, lângă coloane
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    el.after(sr);
  }
}

export function initHovers() {
  initUnderlines();
  initRolls();
}
