import { easeOutCubic, prefersReducedMotion } from '@/lib/math';
import { bandLine, calibrated, formatReading, plan, type Answers } from './logic';
import { button, cascade, el, revealSoon } from './dom';

/** The END V1 scale: 55 ticks from 27 °C, 48.84 design px per degree (28 ° at 50, 34.4 ° at 362.6). */
const SCALE_TICKS = 55;
const scaleX = (t: number) => 1.16 + (t - 27) * 48.84;
const tickTemperature = (i: number) => 27 + (i * 8 + 2 - 1.16) / 48.84;
const designUnits = (n: number) => `calc(${n.toFixed(2)} * var(--sa-scale-u, var(--sa-u)))`;
const COUNT_FROM = 28;
const COUNT_MS = 900;

export interface ReportOptions {
  kitIcon: string;
  onCart: (extra: { subscription: boolean; product?: 'kit' | 'k2' }) => void;
  onRetake: () => void;
}

/** The reading (counted up from 28 °C on its scale), the calibration card and the routine with the kit. */
export class Report {
  readonly element: HTMLElement;
  private frame = 0;
  private timer = 0;

  constructor(answers: Answers, delay: number, options: ReportOptions) {
    const result = plan(answers);
    const name = answers.name.trim();
    const t = result.reading;
    const next = cascade(delay);

    const labels: [value: number, label: string][] = [[28, '28°']];
    if (Math.abs(t - 32) >= 0.9) labels.push([32, '32°']);
    labels.push([t, `${formatReading(t)}°`]);

    const rows: { key: string; value: string; ink?: boolean }[] = [
      { key: 'Skin reading', value: `${formatReading(t)}°C` },
      { key: 'Target', value: '28.0°C' },
      { key: 'Profile', value: result.profile },
      { key: 'Calibrated', value: calibrated() },
      { key: 'Kit ID', value: result.kitId },
    ];
    if (name) rows.unshift({ key: 'For', value: name.toUpperCase(), ink: true });

    const number = el('span', { class: 'sa-rep__num' }, formatReading(COUNT_FROM));
    const ticks = Array.from({ length: SCALE_TICKS }, () => el('i'));
    const scale = el(
      'div',
      { class: 'sa-scale', 'aria-hidden': 'true' },
      el('div', { class: 'sa-scale__ticks' }, ...ticks),
      el('span', { class: 'sa-scale__mark' }),
    );
    const show = (value: number) => {
      number.textContent = formatReading(Math.round(value * 10) / 10);
      scale.style.setProperty('--x', designUnits(scaleX(value)));
      ticks.forEach((tick, i) => {
        const temperature = tickTemperature(i);
        tick.classList.toggle('is-on', temperature >= 27.95 && temperature < value - 0.05);
      });
    };
    show(COUNT_FROM);

    const read = el(
      'div',
      { class: 'sa-report__card sa-report__card--read' },
      el('p', { class: 'sa-rep__label mono', 'data-sa-in': true, style: next() }, 'Your skin reading'),
      el(
        'p',
        { class: 'sa-rep__value', 'data-sa-in': true, style: next(), 'aria-label': `${formatReading(t)}°C` },
        number,
        el('i', { class: 'sa-rep__deg', 'aria-hidden': 'true' }),
        el('span', { 'aria-hidden': 'true' }, 'C'),
      ),
      el('p', { class: 'sa-rep__line', 'data-sa-in': true, style: next() }, bandLine(t, name)),
      el(
        'p',
        { class: 'sa-rep__profile', 'data-sa-in': true, style: next() },
        `Profile: ${result.profile}. ${result.type.desc}`,
      ),
      el(
        'div',
        { 'data-sa-in': true, style: next() },
        scale,
        el(
          'div',
          { class: 'sa-scale__labels', 'aria-hidden': 'true' },
          ...labels.map(([value, label]) => el('span', { style: `--x: ${designUnits(scaleX(value))}` }, label)),
        ),
      ),
      el(
        'div',
        { class: 'sa-cal mono', 'data-sa-in': true, style: next() },
        el('p', { class: 'sa-cal__title' }, 'Calibration'),
        el(
          'dl',
          { class: 'sa-cal__rows' },
          ...rows.map(({ key, value, ink }) =>
            el('div', { class: 'sa-cal__row' }, el('dt', { class: ink ? 'is-ink' : null }, key), el('dd', {}, value)),
          ),
        ),
      ),
    );

    const subscription = el('input', { type: 'checkbox' });
    const routine = el(
      'div',
      { class: 'sa-report__card sa-report__card--plan' },
      el('h2', { class: 'sa-plan__title', 'data-sa-in': true, style: next() }, 'Your recovery routine'),
      el('p', { class: 'sa-plan__sub', 'data-sa-in': true, style: next() }, result.focus),
      el(
        'ul',
        { class: 'sa-kits' },
        ...result.products.map((product) =>
          el(
            'li',
            { class: 'sa-kit', 'data-sa-in': true, style: next() },
            el('img', {
              class: 'sa-kit__icon',
              src: options.kitIcon,
              alt: '',
              width: 62,
              height: 62,
              loading: 'lazy',
              decoding: 'async',
            }),
            el('p', { class: 'sa-kit__name' }, `${product.code} ${product.name}`),
            el('p', { class: 'sa-kit__when' }, product.when),
            el('p', { class: 'sa-kit__text' }, product.text),
          ),
        ),
      ),
      el(
        'ul',
        { class: 'sa-notes', 'data-sa-in': true, style: next() },
        ...result.notes.map((note) => el('li', {}, note)),
      ),
      result.subscription &&
        el(
          'label',
          { class: 'sa-consent sa-sub-opt', 'data-sa-in': true, style: next() },
          subscription,
          el('span', {}, 'Refill every 28 days and save'),
        ),
      el(
        'div',
        { class: 'sa-buy', 'data-sa-in': true, style: next() },
        button('primary', 'Add the recovery kit to cart', () => options.onCart({ subscription: subscription.checked })),
        button('ghost', 'Retake the reading', options.onRetake),
      ),
      result.k2Offer &&
        el(
          'div',
          { 'data-sa-in': true, style: next() },
          button(
            'ghost',
            'Already have a routine? Start with K2 Active Serum',
            () => options.onCart({ subscription: subscription.checked, product: 'k2' }),
            { className: 'sa-offer' },
          ),
        ),
      el(
        'p',
        { class: 'sa-disclaimer', 'data-sa-in': true, style: next() },
        'This reading is a guide based on your answers, not a medical diagnosis. If your skin reacts strongly, talk to a dermatologist.',
      ),
    );

    this.element = el('section', { class: 'sa-screen sa-report' }, read, routine);
    revealSoon(this.element);
    this.countUp(t, delay + 0.25, show);
  }

  leave() {
    this.element.classList.add('is-leaving');
  }

  dispose() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
  }

  /** Counts 28.0 → the reading, `delay` seconds from now. */
  private countUp(target: number, delay: number, show: (value: number) => void) {
    this.timer = window.setTimeout(() => {
      if (prefersReducedMotion()) return show(target);
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / COUNT_MS);
        show(COUNT_FROM + (target - COUNT_FROM) * easeOutCubic(k));
        if (k < 1) this.frame = requestAnimationFrame(step);
      };
      this.frame = requestAnimationFrame(step);
    }, delay * 1000);
  }
}
