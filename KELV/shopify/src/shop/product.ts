import { KelvElement } from '@/lib/element';
import { setOpen } from './accordion';

/**
 * The product page: the quantity stepper, the accordions (one open at a time) and the info column, which sticks
 * under the header; when it is taller than the screen it scrolls first and sticks by its bottom edge.
 */
export class Product extends KelvElement {
  protected mount() {
    this.mountStepper();
    this.mountAccordions();
    this.mountStickySide();
  }

  private mountStepper() {
    const input = this.querySelector<HTMLInputElement>('input[name="quantity"]');
    const label = this.ref('quantity');
    if (!input || !label) return;
    for (const button of this.querySelectorAll<HTMLButtonElement>('[data-step]')) {
      this.listen(button, 'click', () => {
        const value = Math.max(1, Number(input.value) + Number(button.dataset.step));
        input.value = String(value);
        label.textContent = String(value);
      });
    }
  }

  private mountAccordions() {
    const rows = [...this.querySelectorAll('.pdp__acc')];
    for (const row of rows) {
      this.listen(row.querySelector('.acc__head')!, 'click', () => {
        const open = !row.classList.contains('is-open');
        for (const other of rows) setOpen(other, other === row && open);
      });
    }
  }

  private mountStickySide() {
    const info = this.ref('info');
    if (!info) return;
    const place = () => {
      const top = document.querySelector<HTMLElement>('.shop-head')?.offsetHeight ?? 0;
      info.style.top = `${Math.min(top, window.innerHeight - info.offsetHeight)}px`;
    };
    const observer = new ResizeObserver(place);
    observer.observe(info);
    this.cleanup(() => observer.disconnect());
    this.listen(window, 'resize', place);
  }
}
