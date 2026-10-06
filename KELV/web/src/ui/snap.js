// „Scroll hatcher-ul" din hero (cererea userului, 2026-10-06): dacă derulezi PUȚIN în jos
// din hero și te oprești, site-ul te duce înapoi sus de tot.
//
// Pe drinksom.eu nu l-am putut citi din cod (stă într-un modul încărcat la cerere) și nici
// măsura: în Chrome automat Lenis-ul lor nu rulează, scroll-ul rămânea pe loc. Logica e
// construită pe tiparul pe care îl au, la vedere, pe secțiunea cu formularul („join-drop"):
// după 140 ms fără scroll, dacă ești la mai puțin de 350 px de țintă, Lenis te duce acolo
// animat. Aici ținta e vârful hero-ului.
//   · SNAP_MAX — cât de „puțin" înseamnă puțin: 350 px de machetă (formula clamp)
//   · durata 1.2 s, easeOutCubic
// Nu se declanșează cât Lenis animă deja ceva (inclusiv propriul snap) și nici imediat
// după un salt al buclei (scroll-ul tocmai a trecut de la capăt la 0).
const IDLE_MS = 140;
const SNAP_MAX = 350;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function initSnap(lenis) {
  let timer = null, snapping = false;
  lenis.on('scroll', () => {
    clearTimeout(timer);
    if (snapping) return;
    timer = setTimeout(() => {
      // doar pe home: în Skin Analysis (route.js) scroll-ul e al paginii de analiză
      if (document.documentElement.classList.contains('sa-on')) return;
      const y = lenis.scroll;
      const max = SNAP_MAX * Math.max(1, innerWidth / 1720);
      if (y > 2 && y < max && !lenis.isScrolling) {
        snapping = true;
        lenis.scrollTo(0, {
          duration: 1.2,
          easing: easeOutCubic,
          onComplete: () => { snapping = false; },
        });
        // plasă: dacă userul întrerupe animația, `onComplete` nu mai vine
        setTimeout(() => { snapping = false; }, 1400);
      }
    }, IDLE_MS);
  });
}
