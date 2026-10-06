// Cardul care se mărește la intrarea într-o secțiune (secțiunea 2: spuma).
// Copiat din drinksom.eu — valorile citite din stilurile lor inline, la 9 poziții de
// scroll (vezi tokens.css, „cardul care se mărește"):
//   p = cât a urcat secțiunea în ultimul ecran înainte să ajungă sus: 0 când vârful ei e
//       la josul ecranului, 1 când e la vârful ecranului (acolo se fixează sticky-ul)
//   e = easeOutExpo(p) = 1 − 2^(−10p), cu e = 1 exact la p = 1
// JS scrie DOAR `--e`; scale-ul și raza le calculează CSS-ul (pillars.css), ca formula
// să stea într-un singur loc, lângă tokenii ei în px.
const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

export function initZoomCards(scroll) {
  const cards = [...document.querySelectorAll('[data-zoom-card]')].map((card) => ({
    card,
    // ⚠️ se măsoară SECȚIUNEA, nu sticky-ul: sticky-ul are top 0 și, odată fixat, ar
    // raporta mereu 0 — n-ai mai ști cât din secțiune a trecut.
    section: card.closest('section'),
    last: -1,
  }));
  if (!cards.length) return;

  scroll.onFrame(() => {
    const vh = innerHeight;
    for (const c of cards) {
      const top = c.section.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, 1 - top / vh));
      const e = easeOutExpo(p);
      if (Math.abs(e - c.last) < 1e-4) continue;   // nu rescrie stilul dacă nu s-a mișcat
      c.last = e;
      c.card.style.setProperty('--e', e.toFixed(5));
    }
  });
}
