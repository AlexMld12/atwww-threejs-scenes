import { postCustomerForm, postedHere } from '@/lib/customer-form';
import { KelvElement } from '@/lib/element';

/** A small newsletter form (Shopify's customer form), posted in the background; a sent address is cleared. */
export class EmailForm extends KelvElement {
  protected mount() {
    const form = this.querySelector('form')!;
    const note = this.ref('note')!;
    const field = form.querySelector<HTMLInputElement>('[type="email"]')!;
    let sending = false;
    note.hidden = !postedHere(form);
    this.listen(field, 'input', () => (note.hidden = true));
    this.listen(form, 'submit', (event) => {
      event.preventDefault();
      if (sending) return;
      sending = true;
      postCustomerForm(form)
        .then(() => {
          form.reset();
          note.hidden = false;
        })
        .catch((error: unknown) => console.warn('[email form]', error))
        .finally(() => (sending = false));
    });
  }
}
