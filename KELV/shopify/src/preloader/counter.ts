/** The big number: one rolling reel per digit, each as wide as the digit it shows (drinksom.eu). */
export class Counter {
  private widths: number[] = [];
  private value = 0;
  private readonly reels: HTMLElement[];
  readonly measure = () => {
    const sizers = this.root.querySelector('.ld-counter__sizers')?.children ?? [];
    this.widths = [...sizers].map((span) => span.getBoundingClientRect().width);
    this.set(this.value);
  };

  constructor(private readonly root: HTMLElement) {
    this.reels = [...root.querySelectorAll<HTMLElement>('.ld-reel')];
    this.measure();
    window.addEventListener('resize', this.measure);
  }

  set(value: number) {
    this.value = value;
    this.root.setAttribute('aria-label', String(value));
    const digits = [Math.floor(value / 100) % 10, Math.floor(value / 10) % 10, value % 10];
    const shown = [value >= 100, value >= 10, true];
    this.reels.forEach((reel, i) => {
      const width = this.widths[digits[i]];
      reel.style.width = shown[i] ? (width ? `${width}px` : 'auto') : '0px';
      reel.style.setProperty('--digit', String(digits[i]));
      reel.classList.toggle('is-off', !shown[i]);
    });
  }

  dispose() {
    window.removeEventListener('resize', this.measure);
  }
}
