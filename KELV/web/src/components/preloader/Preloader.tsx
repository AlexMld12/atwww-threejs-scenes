'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderLogo } from '@/components/ui/icons';
import { TickBar } from '@/components/ui/TickBar';
import { prefersReducedMotion } from '@/lib/math';
import { preloadProgress } from '@/lib/preload';
import { useFrame, useScroll } from '@/lib/scroll';
import { Counter } from './Counter';
import { isLayerPage } from '@/lib/page-layers';

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

interface Parts {
  bar: HTMLElement | null;
  logo: HTMLElement | null;
  word: HTMLElement | null;
  side: HTMLElement | null;
  info: HTMLElement | null;
  loading: HTMLElement | null;
  count: HTMLElement | null;
}

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

// drinksom.eu's entrances, all started together (the client's request).
function playIntro(p: Parts) {
  p.bar?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: EASE.power2Out, fill: 'both' });
  rise(p.logo, 12, 0, [0, 1], 500, 0, EASE.power2Out);
  rise(p.word, 30, 0, [0, 1], 500, 0, EASE.expoOut);
  rise(p.side, 20, 0, [0, 1], 500, 0, EASE.expoOut);
  rise(p.info, 16, 0, [0, 1], 400, 0, EASE.expoOut);
  const loading = p.loading?.animate(
    [
      { opacity: 0, left: '30px' },
      { opacity: 1, left: '0px' },
    ],
    { duration: 500, easing: EASE.expoOut, fill: 'both' },
  );
  return loading?.finished.then(() =>
    p.loading?.animate([{ opacity: 1 }, { opacity: 0.35 }], {
      duration: 1200,
      easing: EASE.sineInOut,
      iterations: Infinity,
      direction: 'alternate',
    }),
  );
}

function playExit(p: Parts, root: HTMLElement | null) {
  rise(p.bar, 0, -15, [1, 0], 350, 0, EASE.power2In);
  rise(p.count, 0, -50, [1, 0], 500, 0, EASE.power3In);
  [p.logo, p.word].forEach((element, i) => rise(element, 0, -50, [1, 0], 550, 50 + i * 30, EASE.power3In));
  [p.side, p.info, p.loading].forEach((element, i) => rise(element, 0, -35, [1, 0], 500, 80 + i * 25, EASE.power3In));
  root?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], {
    duration: 1100,
    delay: 400,
    easing: EASE.power3InOut,
    fill: 'both',
  });
}

// The word leaves upwards while its copy comes in from below, at each step of the counter.
function rollWord(word: HTMLElement | null) {
  const [current, incoming] = word?.children ?? [];
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

// ?preloader=75 holds the screen at that step, to compare it with the Figma frame (dev only).
function heldStep() {
  if (process.env.NODE_ENV !== 'development') return null;
  const value = new URLSearchParams(window.location.search).get('preloader');
  return value === null ? null : Number(value);
}

/** The loading screen: real progress of the hero scene and the media, then it slides away (drinksom.eu). */
export function Preloader() {
  const { lenis, booted, reveal } = useScroll();
  const [active, setActive] = useState(true);
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const sideRef = useRef<HTMLSpanElement>(null);
  const infoRef = useRef<HTMLSpanElement>(null);
  const loadingRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const state = useRef({ start: -1, shown: 0, step: 0, exiting: false, held: null as number | null });
  const pulse = useRef<Animation | null>(null);

  const parts = useCallback(
    (): Parts => ({
      bar: barRef.current,
      logo: logoRef.current,
      word: wordRef.current,
      side: sideRef.current,
      info: infoRef.current,
      loading: loadingRef.current,
      count: countRef.current,
    }),
    [],
  );

  const leave = useCallback(() => {
    const reduced = prefersReducedMotion();
    pulse.current?.cancel();
    if (!reduced) playExit(parts(), rootRef.current);
    setTimeout(reveal, reduced ? 0 : EXIT_REVEAL_MS);
    setTimeout(() => setActive(false), reduced ? 0 : EXIT_DURATION_MS);
  }, [parts, reveal]);

  useEffect(() => {
    if (!booted) return;
    const frame = requestAnimationFrame(() => {
      if (isLayerPage()) {
        reveal();
        setActive(false);
        return;
      }
      const s = state.current;
      s.held = heldStep();
      if (s.held !== null) {
        s.step = s.held;
        setStep(s.held);
      }
      s.start = performance.now();
      if (prefersReducedMotion()) return;
      playIntro(parts())
        ?.then((animation) => {
          pulse.current = animation ?? null;
        })
        .catch(() => {});
    });
    return () => cancelAnimationFrame(frame);
  }, [booted, parts, reveal]);

  useEffect(() => {
    if (!active || !lenis) return;
    window.scrollTo(0, 0);
    lenis.stop();
    return () => lenis.start();
  }, [active, lenis]);

  useFrame((now) => {
    const s = state.current;
    if (!active || s.start < 0 || s.exiting || s.held !== null) return;
    const t = (now - s.start) / 1000;
    // Never faster than the intro, never ahead of what is really loaded.
    const pace = 1 - Math.pow(1 - Math.min(1, t / MIN_DURATION_S), 2);
    const loaded = t > MAX_WAIT_S ? 1 : preloadProgress();
    const target = Math.min(pace, loaded);
    s.shown += (target - s.shown) * SMOOTHING;
    if (target - s.shown < 1e-3) s.shown = target;

    const next = s.shown >= 1 ? 100 : Math.max(...STEPS.filter((value) => s.shown * 100 >= value));
    if (next === s.step) return;
    s.step = next;
    setStep(next);
    if (!prefersReducedMotion()) rollWord(wordRef.current);
    if (next === 100) {
      s.exiting = true;
      setTimeout(leave, EXIT_DELAY_MS);
    }
  });

  const barProgress = useCallback(() => (state.current.held !== null ? HELD_BAR : state.current.shown), []);

  if (!active) return null;

  return (
    <div ref={rootRef} className="preloader" role="status" aria-label="Loading">
      <div ref={barRef} className="ld-bar">
        <TickBar progress={barProgress} topToken="--ld-tick-top" />
      </div>
      <div className="ld-logo">
        <span ref={logoRef} className="ld-move">
          <LoaderLogo />
        </span>
      </div>
      <div className="ld-word" aria-hidden="true">
        <span ref={wordRef} className="ld-move">
          <span>Skincare</span>
          <span>Skincare</span>
        </span>
      </div>
      <p className="ld-side mono">
        <span ref={sideRef} className="ld-move">
          Skincare
        </span>
      </p>
      <p className="ld-loading mono">
        <span ref={loadingRef} className="ld-move">
          Loading experience
        </span>
      </p>
      <p className="ld-info mono">
        <span ref={infoRef} className="ld-move">
          Three steps back to baseline. Cool. Calm. Seal. Repeat.
        </span>
      </p>
      <div className="ld-count">
        <span ref={countRef} className="ld-move">
          <Counter value={step} />
        </span>
      </div>
    </div>
  );
}
