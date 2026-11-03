import { KelvElement } from '@/lib/element';
import { prefersReducedMotion } from '@/lib/math';
import { preloadProgress } from '@/lib/preload';
import { getLenis, reveal, whenBooted } from '@/lib/scroll';
import { startTickBar } from '@/ui/tick-bar';
import { Counter } from './counter';

// GSAP's eases as CSS curves (power2 = cubic, power3 = quart).
const EASE = {
  power2Out: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  power2In: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
  power2InOut: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
  power3In: 'cubic-bezier(0.895, 0.03, 0.685, 0.22)',
  power3InOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  expoOut: 'cubic-bezier(0.19, 1, 0.22, 1)',
  sineInOut: 'cubic-bezier(0.445, 0.05, 0.55, 0.95)',
};

const STEPS = [0, 25, 50, 75];
const MIN_DURATION_S = 2.8;
const MAX_WAIT_S = 20;
const SMOOTHING = 0.12;
const EXIT_DELAY_MS = 550;
const EXIT_REVEAL_MS = 350;
const EXIT_DURATION_MS = 1500;
const WORD_ROLL_MS = 600;
// The Figma frame: 184 of 219 ticks lit.
const HELD_BAR = 184 / 219;

// Vertical offset + fade; `top`, not transform, so the text stays sharp while it moves.
function rise(
  element: HTMLElement | null,
  from: number,
  to: number,
  fade: [number, number],
  ms: number,
  delay: number,
  easing: string,
) {
  element?.animate(
    [
      { opacity: fade[0], top: `${from}px` },
      { opacity: fade[1], top: `${to}px` },
    ],
    { duration: ms, delay, easing, fill: 'both' },
  );
}

// ?preloader=75 holds the screen at that step, to compare it with the Figma frame (development only).
function heldStep() {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get('preloader');
  return value === null ? null : Number(value);
}

/** The loading screen: real progress of the 3D scenes, then it slides away (drinksom.eu). */
export class Preloader extends KelvElement {
  private counter!: Counter;
  private start = -1;
  private shown = 0;
  private step = 0;
  private exiting = false;
  private held: number | null = null;
  private pulse: Animation | null = null;

  protected mount() {
    this.counter = new Counter(this.ref('counter')!);
    this.cleanup(() => this.counter.dispose());
    this.cleanup(startTickBar(this.querySelector('.ticks')!, () => (this.held !== null ? HELD_BAR : this.shown)));

    window.scrollTo(0, 0);
    getLenis()?.stop();
    this.cleanup(() => getLenis()?.start());

    whenBooted(() => requestAnimationFrame(() => this.begin()));
    this.frame((now) => this.tick(now));
  }

  private begin() {
    if (!this.isConnected) return;
    // Measured again with the fonts in.
    this.counter.measure();
    this.held = heldStep();
    if (this.held !== null) this.setStep(this.held);
    this.start = performance.now();
    if (!prefersReducedMotion()) this.playIntro();
  }

  private tick(now: number) {
    if (this.start < 0 || this.exiting || this.held !== null) return;
    const t = (now - this.start) / 1000;
    // Never faster than the intro, never ahead of what is really loaded.
    const pace = 1 - Math.pow(1 - Math.min(1, t / MIN_DURATION_S), 2);
    const loaded = t > MAX_WAIT_S ? 1 : preloadProgress();
    const target = Math.min(pace, loaded);
    this.shown += (target - this.shown) * SMOOTHING;
    if (target - this.shown < 1e-3) this.shown = target;

    const next = this.shown >= 1 ? 100 : Math.max(...STEPS.filter((value) => this.shown * 100 >= value));
    if (next === this.step) return;
    this.setStep(next);
    if (!prefersReducedMotion()) this.rollWord();
    if (next === 100) {
      this.exiting = true;
      setTimeout(() => this.leave(), EXIT_DELAY_MS);
    }
  }

  private setStep(step: number) {
    this.step = step;
    this.counter.set(step);
  }

  // drinksom.eu's entrances, all started together (the client's request).
  private playIntro() {
    this.ref('bar')?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 500,
      easing: EASE.power2Out,
      fill: 'both',
    });
    rise(this.ref('logo'), 12, 0, [0, 1], 500, 0, EASE.power2Out);
    rise(this.ref('word'), 30, 0, [0, 1], 500, 0, EASE.expoOut);
    rise(this.ref('side'), 20, 0, [0, 1], 500, 0, EASE.expoOut);
    rise(this.ref('info'), 16, 0, [0, 1], 400, 0, EASE.expoOut);
    const loading = this.ref('loading');
    loading
      ?.animate(
        [
          { opacity: 0, left: '30px' },
          { opacity: 1, left: '0px' },
        ],
        { duration: 500, easing: EASE.expoOut, fill: 'both' },
      )
      .finished.then(() => {
        this.pulse = loading.animate([{ opacity: 1 }, { opacity: 0.35 }], {
          duration: 1200,
          easing: EASE.sineInOut,
          iterations: Infinity,
          direction: 'alternate',
        });
      })
      .catch(() => {});
  }

  // The word leaves upwards while its copy comes in from below, at each step of the counter.
  private rollWord() {
    const [current, incoming] = this.ref('word')?.children ?? [];
    if (!current || !incoming) return;
    const timing = { duration: WORD_ROLL_MS, easing: EASE.power2InOut };
    current.animate([{ top: '0' }, { top: 'calc(-1 * var(--ld-word-roll))' }], timing);
    incoming.animate(
      [
        { top: '0', opacity: 0 },
        { top: 'calc(-1 * var(--ld-word-roll))', opacity: 1 },
      ],
      timing,
    );
  }

  private playExit() {
    rise(this.ref('bar'), 0, -15, [1, 0], 350, 0, EASE.power2In);
    rise(this.ref('count'), 0, -50, [1, 0], 500, 0, EASE.power3In);
    [this.ref('logo'), this.ref('word')].forEach((element, i) =>
      rise(element, 0, -50, [1, 0], 550, 50 + i * 30, EASE.power3In),
    );
    [this.ref('side'), this.ref('info'), this.ref('loading')].forEach((element, i) =>
      rise(element, 0, -35, [1, 0], 500, 80 + i * 25, EASE.power3In),
    );
    this.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], {
      duration: 1100,
      delay: 400,
      easing: EASE.power3InOut,
      fill: 'both',
    });
  }

  private leave() {
    const reduced = prefersReducedMotion();
    this.pulse?.cancel();
    if (!reduced) this.playExit();
    setTimeout(reveal, reduced ? 0 : EXIT_REVEAL_MS);
    setTimeout(() => this.remove(), reduced ? 0 : EXIT_DURATION_MS);
  }
}
