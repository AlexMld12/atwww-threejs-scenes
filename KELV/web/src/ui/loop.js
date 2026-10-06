// Continuitatea site-ului (cererea userului, 2026-10-06; ca pe drinksom.eu):
//   · scroll în jos din footer → ajungi în hero; scroll în sus din hero → ajungi în footer.
// Drinksom: Lenis cu `infinite: true` + o secțiune `footer-hero-loop` după footer, care
// arată primul ecran din hero. Lenis ține scroll-ul modulo lungimea paginii: la capăt
// sare la 0. Cadrul de la capăt (copia) și cel de la 0 (hero-ul) sunt identice, deci
// saltul nu se vede. Opțiunile Lenis sunt în ui/index.js.
//
// Copia se face din hero-ul REAL, la pornire, înainte ca reveal-urile să-i spargă textele:
// fără `data-reveal` (textele stau deja în starea finală, ca hero-ul după încărcare), fără
// `id` (altfel ar fi duplicate), `inert` (nu se poate da click / tab în ea).
// ⚠️ Rulează ÎNAINTE de startReveals() (main.js) — vezi ui/index.js.
export function initLoop() {
  const slot = document.querySelector('[data-loop]');
  const hero = document.querySelector('.hero');
  if (!slot || !hero) return;
  const copy = hero.cloneNode(true);
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  copy.querySelectorAll('[data-reveal]').forEach((el) => {
    el.removeAttribute('data-reveal');
    el.removeAttribute('data-reveal-lines');
    el.removeAttribute('data-reveal-fx');
  });
  copy.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));
  slot.appendChild(copy);
}
