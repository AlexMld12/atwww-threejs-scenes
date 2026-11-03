import { easeOutCubic, prefersReducedMotion } from '@/lib/math';
import { formatReading } from './logic';

const COUNT_MS = 450;
const EMPTY = '––.–';

/** LIVE READING in the header, counting to each new value. */
export class LiveReading {
  private from: number | null = null;
  private target: number | null = null;
  private frame = 0;

  constructor(private readonly element: HTMLElement) {}

  set(value: number | null) {
    if (value === this.target) return;
    this.target = value;
    cancelAnimationFrame(this.frame);
    if (value === null || this.from === null || prefersReducedMotion()) {
      this.from = value;
      this.frame = requestAnimationFrame(() => this.show(value));
      return;
    }
    const start = performance.now();
    const origin = this.from;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / COUNT_MS);
      const current = origin + (value - origin) * easeOutCubic(k);
      this.from = current;
      this.show(Math.round(current * 10) / 10);
      if (k < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
  }

  private show(value: number | null) {
    this.element.textContent = value === null ? EMPTY : formatReading(value);
  }
}
