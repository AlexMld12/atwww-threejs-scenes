// Text spart în „ferestre” (overflow ascuns) pentru animațiile de tip drinksom: fiecare
// cuvânt / rând urcă sau coboară în fereastra lui. Stilurile: `.sw-*` în pillars.css.
// Folosit de pillars.js și gallery.js.

// ---- cuvinte / rânduri în „ferestre" (vezi .sw-* în pillars.css) ----
export function fillWords(el, text) {
  el.textContent = '';
  text.split(' ').forEach((w, i, all) => {
    const win = document.createElement('span');
    win.className = 'sw-win';
    const inn = document.createElement('span');
    inn.className = 'sw-in';
    inn.textContent = w;
    win.appendChild(inn);
    el.appendChild(win);
    // spațiul stă ÎNTRE ferestre, nu în ele: la capăt de inline-block s-ar pierde
    if (i < all.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return [...el.querySelectorAll('.sw-in')];
}
export function fillLines(el, text) {
  el.textContent = '';
  for (const line of text.split('\n')) {
    const win = document.createElement('span');
    win.className = 'sw-win sw-win--line';
    const inn = document.createElement('span');
    inn.className = 'sw-in';
    inn.textContent = line;
    win.appendChild(inn);
    el.appendChild(win);
  }
  return [...el.querySelectorAll('.sw-in')];
}

