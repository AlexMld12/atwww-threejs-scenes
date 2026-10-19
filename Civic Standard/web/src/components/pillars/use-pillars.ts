import { useEffect, type RefObject } from 'react';
import { clamp01 } from '@/lib/design';

// As in the reference (fluid.glass/about, AboutBeliefs): scrubbed by the scroll, words rising from 150 % inside their
// mask (power3.inOut, 0.5 each, 0.05 apart), pills fading in at the end (0.1 each, from 0.4). The range starts later
// than theirs and runs until the whole section is on screen (its top at 85 % → its bottom at the screen's bottom), and
// it follows the scroll with a lag (time constant FOLLOW_S), so even a fast scroll shows the words rising in ~1 s.
const START = 0.85;
const FOLLOW_S = 0.35;
const TIMELINE = 0.6;
const WORD = 0.5;
const STAGGER = 0.05;
const PILL_AT = 0.4;
const PILL = 0.1;
const WORD_FROM = 1.5;

// The lines draw one after another as theirs do (the right one up from below, then the middle one, then the left
// one). Then a black line, as the preloader's, traces over the same contour; it retracts, then the faint one does,
// and again after a short pause, for as long as the section is on screen. Each phase follows the one before.
// The loop starts as the section comes into the screen (its top at 60 %).
const LOOP_FROM = 0.6;
const FAINT_DRAW_S = 3;
const INK_DRAW_S = 2.4;
const INK_HOLD_S = 0.4;
const INK_RETRACT_S = 2;
const FAINT_RETRACT_S = 2.4;
const PAUSE_S = 0.3;

const power3InOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const sineInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

const LOOP_S = FAINT_DRAW_S + INK_DRAW_S + INK_HOLD_S + INK_RETRACT_S + FAINT_RETRACT_S + PAUSE_S;
const INK_FROM = FAINT_DRAW_S;
const INK_BACK = INK_FROM + INK_DRAW_S + INK_HOLD_S;
const FAINT_BACK = INK_BACK + INK_RETRACT_S;

/** A layer drawn over [from, from + draw] and retracted over [back, back + retract]: its shown share, 0…1. */
function shareAt(u: number, from: number, draw: number, back: number, retract: number) {
  if (u < from) return 0;
  if (u < from + draw) return sineInOut((u - from) / draw);
  if (u < back) return 1;
  return 1 - sineInOut(clamp01((u - back) / retract));
}

/** How much of each layer is shown `t` seconds into the loop. */
function drawnAt(t: number) {
  const u = t % LOOP_S;
  return {
    faint: shareAt(u, 0, FAINT_DRAW_S, FAINT_BACK, FAINT_RETRACT_S),
    ink: shareAt(u, INK_FROM, INK_DRAW_S, INK_BACK, INK_RETRACT_S),
  };
}

export function usePillars(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = root.current!;
    const words = [...section.querySelectorAll<HTMLElement>('.pillars__glyphs')];
    const pills = [...section.querySelectorAll<HTMLElement>('.pillars__pill')];
    // Each layer's paths in drawing order, with their lengths: the drawn share runs through them one after another.
    const layer = (name: 'faint' | 'ink') => {
      const paths = [...section.querySelectorAll<SVGPathElement>(`[data-layer="${name}"]`)]
        .sort((a, b) => Number(a.dataset.draw) - Number(b.dataset.draw))
        .map((path) => ({ path, length: path.getTotalLength() }));
      paths.forEach(({ path, length }) => {
        path.style.strokeDasharray = `${length} ${length}`;
        path.style.strokeDashoffset = String(length);
      });
      return { paths, total: paths.reduce((sum, { length }) => sum + length, 0) };
    };
    const layers = { faint: layer('faint'), ink: layer('ink') };

    let visible = false;
    let shownProgress = 0;
    let last = performance.now();
    let loopStart = -1;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    observer.observe(section);

    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!visible) return;
      const { top } = section.getBoundingClientRect();
      const height = window.innerHeight;
      const end = Math.min(height - section.offsetHeight, START * height - 1);
      const target = clamp01((START * height - top) / (START * height - end)) * TIMELINE;
      shownProgress += (target - shownProgress) * (1 - Math.exp(-dt / FOLLOW_S));
      const progress = shownProgress;

      words.forEach((word, k) => {
        const u = power3InOut(clamp01((progress - k * STAGGER) / WORD));
        word.style.top = `${WORD_FROM * word.offsetHeight * (1 - u)}px`;
      });
      pills.forEach((pill, k) => {
        const u = power3InOut(clamp01((progress - PILL_AT - k * STAGGER) / PILL));
        pill.style.opacity = String(u);
        pill.style.visibility = u > 0 ? 'visible' : 'hidden';
      });

      // The loop starts once the section has come into the screen, so its first drawing is seen from the start.
      if (loopStart < 0 && top < LOOP_FROM * height) loopStart = now;
      const drawn = loopStart < 0 ? { faint: 0, ink: 0 } : drawnAt((now - loopStart) / 1000);
      (['faint', 'ink'] as const).forEach((name) => {
        const { paths, total } = layers[name];
        let shown = drawn[name] * total;
        paths.forEach(({ path, length }) => {
          const part = Math.min(length, Math.max(0, shown));
          shown -= length;
          path.style.strokeDashoffset = String(length - part);
        });
      });
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [root]);
}
