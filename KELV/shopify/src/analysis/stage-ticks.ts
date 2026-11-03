import { measureTicks } from '@/lib/css';
import { STAGES } from './logic';
import { el } from './dom';

const STEP_MS = 14;

interface Counter {
  bar: HTMLElement;
  total: number;
  lit: number;
  target: number;
  frame: number;
}

/** The four stage bars: ticks snapped to device pixels, lit one by one like a counter. */
export class StageTicks {
  private readonly items: HTMLElement[];
  private readonly counters: Counter[];
  private progress = STAGES.map(() => 0);

  constructor(private readonly list: HTMLElement) {
    this.counters = STAGES.map(() => ({
      bar: el('span', { class: 'sa-ticks' }),
      total: 0,
      lit: 0,
      target: 0,
      frame: 0,
    }));
    this.items = STAGES.map((stage, i) => {
      this.counters[i].bar.append(el('span', { class: 'sa-ticks__lit' }));
      return el(
        'li',
        { class: 'sa-stage' },
        el('span', { class: 'sa-stage__label mono' }, stage.label),
        this.counters[i].bar,
      );
    });
    list.replaceChildren(...this.items);
  }

  /** Measured again whenever the panel becomes visible, so the bars get their real width. */
  measure() {
    const list = this.list;
    if (!list.offsetWidth) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, pitch, height } = measureTicks(list, '--sa-tick');
    this.counters.forEach((counter, i) => {
      const bar = counter.bar;
      const length = Math.floor(bar.parentElement!.getBoundingClientRect().width * dpr) / dpr;
      bar.style.setProperty('--tk-w', `${width}px`);
      bar.style.setProperty('--tk-p', `${pitch}px`);
      bar.style.setProperty('--tk-h', `${height}px`);
      counter.total = Math.floor((length - width) / pitch) + 1;
      // Only whole ticks: a cut-off last one could never light up.
      bar.style.setProperty('--tk-len', `${(counter.total - 1) * pitch + width}px`);
      counter.target = counter.lit = Math.round(this.progress[i] * counter.total);
      bar.style.setProperty('--lit', String(counter.lit));
    });
  }

  /** `progress` of each stage, 0…1; the ticks count up to it unless `instant`. */
  update(progress: number[], active: number, instant: boolean) {
    this.progress = progress;
    this.items.forEach((item, i) => item.classList.toggle('is-active', i === active));
    progress.forEach((fraction, i) => {
      const counter = this.counters[i];
      counter.target = Math.round(fraction * counter.total);
      cancelAnimationFrame(counter.frame);
      if (instant) {
        counter.lit = counter.target;
        counter.bar.style.setProperty('--lit', String(counter.lit));
        return;
      }
      let last = performance.now();
      const tick = (now: number) => {
        const steps = Math.floor((now - last) / STEP_MS);
        if (steps > 0) {
          last += steps * STEP_MS;
          const remaining = counter.target - counter.lit;
          counter.lit += Math.sign(remaining) * Math.min(steps, Math.abs(remaining));
          counter.bar.style.setProperty('--lit', String(counter.lit));
        }
        if (counter.lit !== counter.target) counter.frame = requestAnimationFrame(tick);
      };
      counter.frame = requestAnimationFrame(tick);
    });
  }

  dispose() {
    for (const counter of this.counters) cancelAnimationFrame(counter.frame);
  }
}
