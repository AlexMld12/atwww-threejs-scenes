import { KelvElement } from '@/lib/element';
import { getLenis } from '@/lib/scroll';

interface CartResponse {
  item_count: number;
  sections?: Record<string, string>;
}

/**
 * The cart drawer, on Shopify's Ajax cart: Add to cart (any product form) and the line buttons call `/cart/*.js`,
 * which also return the drawer rendered again (Section Rendering API), so its markup lives only in Liquid.
 * Buy it now and checkout stay ordinary form posts to Shopify.
 */
export class CartDrawer extends KelvElement {
  private queue: Promise<unknown> = Promise.resolve();

  protected mount() {
    const section = this.closest('.shopify-section')?.id.replace(/^shopify-section-/, '') ?? 'cart-drawer';
    if (this.classList.contains('is-open')) getLenis()?.stop();

    this.listen(document, 'click', (event) => {
      const target = event.target as Element;
      if (target.closest('[data-cart-open]')) this.setOpen(true);
      else if (target.closest('[data-cart-close]') && this.contains(target)) this.setOpen(false);
      const line = target.closest<HTMLElement>('[data-line]');
      if (line && this.contains(line)) {
        void this.send(
          this.dataset.changeUrl!,
          { id: line.dataset.line, quantity: Number(line.dataset.quantity) },
          section,
        );
      }
    });
    this.listen(document, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape' && this.classList.contains('is-open')) this.setOpen(false);
    });

    // A page brought in by the router was fetched earlier: its header gets the current count.
    this.listen(document, 'kelv:layer-enter', () => this.syncLinks());

    // The skin reading's kit, with the reading as line properties.
    this.listen(document, 'kelv:add-to-cart', (event) => {
      const { items } = (event as CustomEvent<{ items: unknown[] }>).detail;
      void this.send(this.dataset.addUrl!, { items }, section).then((ok) => ok && this.setOpen(true));
    });

    // Add to cart on any product form; Buy it now (`return_to`) goes on to Shopify's checkout.
    this.listen(document, 'submit', (event) => {
      const form = event.target as HTMLFormElement;
      const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
      if (!form.action.endsWith(this.dataset.addUrl!) || submitter?.name === 'return_to') return;
      event.preventDefault();
      const data = new FormData(form);
      const item = { id: Number(data.get('id')), quantity: Number(data.get('quantity') ?? 1) };
      // Refused: the plain form shows Shopify's own message.
      void this.send(this.dataset.addUrl!, { items: [item] }, section).then((ok) =>
        ok ? this.setOpen(true) : form.submit(),
      );
    });
  }

  private setOpen(open: boolean) {
    if (this.classList.contains('is-open') === open) return;
    this.classList.toggle('is-open', open);
    this.toggleAttribute('inert', !open);
    this.setAttribute('aria-hidden', String(!open));
    const lenis = getLenis();
    if (open) lenis?.stop();
    else lenis?.start();
  }

  /** One request at a time, in click order; false if Shopify refused it (sold out, a removed variant). */
  private send(url: string, body: Record<string, unknown>, section: string) {
    const request = this.queue.then(async () => {
      const response = await fetch(`${url}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...body, sections: section, sections_url: location.pathname }),
      });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      const cart: CartResponse = await response.json();
      const html = cart.sections?.[section];
      if (html) this.render(html);
      return true;
    });
    this.queue = request.catch(() => {});
    return request.catch((error: unknown) => {
      console.error('[cart]', error);
      return false;
    });
  }

  /** The drawer's panel from Shopify's new render; the drawer itself stays, so it does not close or replay. */
  private render(html: string) {
    const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLElement>('[data-part="panel"]');
    const panel = this.ref('panel');
    if (!fresh || !panel) return;
    panel.replaceChildren(...fresh.childNodes);
    panel.dataset.linkLabel = fresh.dataset.linkLabel ?? '';
    this.syncLinks();
  }

  private syncLinks() {
    const label = this.ref('panel')?.dataset.linkLabel;
    if (!label) return;
    for (const link of document.querySelectorAll('.shop-cart-link')) link.textContent = label;
  }
}
