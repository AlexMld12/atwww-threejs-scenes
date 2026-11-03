import { KelvElement } from '@/lib/element';
import { setOpen } from './accordion';

/** More Informations: one question open at a time; the bar under the title advances to the next one (NEXT skips). */
export class MoreInfo extends KelvElement {
  protected mount() {
    const rows = [...this.querySelectorAll('.faq__item')];
    const bar = this.ref('bar')!;
    const counter = this.ref('index')!;
    let index = 0;
    let inView = false;

    // The bar's animation restarts for every question.
    const play = () => {
      bar.classList.remove('is-playing');
      if (!inView || rows.length < 2) return;
      void bar.offsetWidth;
      bar.classList.add('is-playing');
    };
    const show = (next: number) => {
      index = next;
      rows.forEach((row, i) => setOpen(row, i === index));
      counter.textContent = String(index + 1);
      play();
    };

    rows.forEach((row, i) => this.listen(row.querySelector('.acc__head')!, 'click', () => show(i)));
    this.listen(this.ref('next')!, 'click', () => show((index + 1) % rows.length));
    this.listen(bar, 'animationend', () => show((index + 1) % rows.length));

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting === inView) return;
        inView = entry.isIntersecting;
        play();
      },
      { threshold: 0.3 },
    );
    observer.observe(this.querySelector('.more')!);
    this.cleanup(() => observer.disconnect());
  }
}
