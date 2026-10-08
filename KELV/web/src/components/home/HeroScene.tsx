'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { clamp01, prefersReducedMotion } from '@/lib/math';
import { finishTask, type PreloadTask } from '@/lib/preload';
import { useFrame, useScroll } from '@/lib/scroll';
import { INTRO_DURATION, LOOK, REST_TIME } from '@/scene/config';
import type { HeroScene as Scene } from '@/scene/hero-scene';
import { isLayerPage } from '@/lib/page-layers';

const HERO_TASKS: PreloadTask[] = ['hero-code', 'hero-data', 'hero-model', 'hero-lut', 'hero-compile'];

const FADE_IN_S = 0.5;
const MAX_PIXEL_RATIO = 2;

/** The 3D products over the hero (and its loop copy): the intro plays on load, scrolling scrubs the rest. */
export function HeroScene({ targets }: { targets: RefObject<HTMLElement | null>[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const introStart = useRef<number | null>(null);
  const reducedMotion = useRef(false);
  const last = useRef({ time: -1, width: 0, height: 0, x: Number.NaN, y: Number.NaN, visible: false });
  const { ready } = useScroll();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const root = document.documentElement;
    reducedMotion.current = prefersReducedMotion();
    let disposed = false;

    import('@/scene/hero-scene')
      .then(({ createHeroScene }) => {
        finishTask('hero-code');
        return createHeroScene(canvas);
      })
      .then((created) => {
        if (disposed) return created.dispose();
        scene.current = created;
        if (process.env.NODE_ENV === 'development') Object.assign(window, { __kelvHero: created, __LOOK: LOOK });
        last.current.width = 0;
        root.classList.add('has-3d');
      })
      .catch((error: unknown) => {
        for (const task of HERO_TASKS) finishTask(task);
        root.classList.add('no-3d');
        console.error('[hero scene]', error);
      });

    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
      root.classList.remove('has-3d');
    };
  }, []);

  useFrame((now) => {
    const canvas = canvasRef.current;
    const current = scene.current;
    if (!canvas || !current) return;
    const state = last.current;
    const viewport = window.innerHeight;

    const target = isLayerPage()
      ? undefined
      : targets
          .map((t) => t.current)
          .find((element) => {
            const rect = element?.getBoundingClientRect();
            return rect && rect.bottom > 0 && rect.top < viewport;
          });

    if (state.visible !== Boolean(target)) {
      state.visible = Boolean(target);
      canvas.classList.toggle('is-visible', state.visible);
    }
    if (!target) return;
    const box = target.getBoundingClientRect();

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const width = snap(box.width);
    const height = snap(box.height);
    if (width !== state.width || height !== state.height) {
      state.width = width;
      state.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      current.setSize(width, height, dpr);
      state.time = -1;
    }
    const x = snap(box.left);
    const y = snap(box.top);
    if (x !== state.x || y !== state.y) {
      state.x = x;
      state.y = y;
      canvas.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    if (introStart.current === null && ready) introStart.current = now;
    const elapsed = introStart.current === null ? 0 : (now - introStart.current) / 1000;
    const intro = reducedMotion.current ? INTRO_DURATION : Math.min(INTRO_DURATION, elapsed);
    canvas.style.opacity = String(clamp01(elapsed / FADE_IN_S));

    const section = (target.parentElement ?? target).getBoundingClientRect();
    const progress = clamp01(-section.top / section.height);
    const time = Math.round((intro + progress * (current.duration - REST_TIME)) * 1000) / 1000;

    if (time === state.time) return;
    state.time = time;
    current.setTime(time);
    current.render();
  });

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
