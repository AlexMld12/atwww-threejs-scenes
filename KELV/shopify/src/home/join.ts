import { postCustomerForm, postedHere } from '@/lib/customer-form';
import { KelvElement } from '@/lib/element';
import { observeReveals } from '@/ui/reveal';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORAGE_KEY = 'kelv:newsletter';

/** Addresses subscribed from this browser; storage can be missing (private windows, blocked site data). */
function storedEmails(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function storeEmail(email: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...storedEmails(), email])]));
  } catch {
    // Not remembered: the next visit can subscribe the address again, which Shopify accepts.
  }
}

/**
 * 07: consent unlocks with a valid email, sending with the consent (drinksom join-drop). The form is Shopify's
 * customer form, posted in the background (Shopify's captcha, when it asks for one, is a page of its own). An address
 * already subscribed (from this browser, or the signed-in customer's) cannot be sent again.
 */
export class Join extends KelvElement {
  protected mount() {
    this.cleanup(observeReveals(this));
    const form = this.querySelector('form')!;
    const field = this.ref('field')!;
    const email = this.ref<HTMLInputElement>('email')!;
    const error = this.ref('error')!;
    const note = this.ref('note')!;
    const noteText = this.ref('note-text')!;
    const consent = this.ref('consent')!;
    const consentInput = this.ref<HTMLInputElement>('consent-input')!;
    const send = this.ref<HTMLButtonElement>('send')!;
    const subscribed = new Set(storedEmails());
    if (form.dataset.subscribed) subscribed.add(form.dataset.subscribed.toLowerCase());
    let touched = false;
    let justSent = '';
    let sending = false;

    const posted = postedHere(form);
    if (posted) {
      subscribed.add(posted);
      storeEmail(posted);
      email.value = posted;
      justSent = posted;
    }

    const update = () => {
      const value = email.value.trim();
      const key = value.toLowerCase();
      const valid = EMAIL.test(value);
      const showError = touched && value.length > 0 && !valid;
      const known = valid && subscribed.has(key);
      const open = valid && !known;
      if (!open) consentInput.checked = false;

      field.classList.toggle('is-error', showError);
      field.classList.toggle('is-noted', known);
      email.setAttribute('aria-invalid', String(showError));
      error.hidden = !showError;
      note.hidden = !known;
      noteText.textContent = known ? (key === justSent ? note.dataset.subscribed! : note.dataset.already!) : '';
      consent.classList.toggle('is-disabled', !open);
      consentInput.disabled = !open;
      send.disabled = sending || !(open && consentInput.checked);
    };

    this.listen(email, 'input', () => {
      justSent = '';
      update();
    });
    this.listen(email, 'blur', () => {
      touched = true;
      update();
    });
    this.listen(consentInput, 'change', update);
    this.listen(form, 'submit', (event) => {
      event.preventDefault();
      if (send.disabled || sending) return;
      const address = email.value.trim().toLowerCase();
      sending = true;
      update();
      postCustomerForm(form)
        .then(() => {
          subscribed.add(address);
          storeEmail(address);
          justSent = address;
        })
        .catch((error: unknown) => console.warn('[join]', error))
        .finally(() => {
          sending = false;
          update();
        });
    });
    update();
  }
}
