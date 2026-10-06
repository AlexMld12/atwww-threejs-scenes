// 07 · BECOME SOMEONE POWERFUL — formularul și produsul.
//
// Formularul (comportamentul de pe drinksom.eu, „join-drop"; ordinea e a userului):
//   1. email valid  → checkbox-ul devine disponibil (în machetă: rândul la 30%, inactiv)
//   2. bifat        → SEND FORM devine activ (în machetă: 20%, inactiv)
//   eroarea „INVALID EMAIL ADDRESS" apare doar după ce userul a părăsit câmpul (blur), ca
//   la ei — nu din prima literă tastată.
//   ⚠️ Trimiterea nu duce încă nicăieri: la ei e un POST pe /api/waitlist; aici backend-ul
//   vine odată cu Shopify (vezi docs/SITE_FLOW.md).
//
// Produsul de pe secțiune NU e aici: e stratul fix din src/ui/travel.js, care pleacă de pe
// secțiunea 7 și ajunge în footer.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;   // același test ca pe drinksom

export function initJoin() {
  const section = document.querySelector('.join');
  if (!section) return;
  const field = section.querySelector('.field');
  const input = section.querySelector('#join-email');
  const error = section.querySelector('.field__error');
  const consent = section.querySelector('.consent');
  const box = section.querySelector('#join-consent');
  const send = section.querySelector('.join__send');
  const form = section.querySelector('.join__form');

  // ---- formularul ----
  let touched = false;
  function update() {
    const value = input.value.trim();
    const valid = EMAIL_RE.test(value);
    const showError = touched && value.length > 0 && !valid;
    field.classList.toggle('is-error', showError);
    error.hidden = !showError;
    input.setAttribute('aria-invalid', showError ? 'true' : 'false');
    box.disabled = !valid;
    consent.classList.toggle('is-disabled', !valid);
    if (!valid) box.checked = false;            // emailul stricat retrage și acordul
    send.disabled = !(valid && box.checked);
  }
  input.addEventListener('input', update);
  input.addEventListener('blur', () => { touched = true; update(); });
  box.addEventListener('change', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (send.disabled) return;
    // backend-ul vine odată cu Shopify; deocamdată doar confirmăm local
    console.info('[join] email:', input.value.trim());
  });
  update();
}
