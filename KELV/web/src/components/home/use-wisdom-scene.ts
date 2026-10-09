'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { clamp01 } from '@/lib/math';
import { finishTask, type PreloadTask } from '@/lib/preload';
import { useFrame } from '@/lib/scroll';
import { WISDOM_LOOK } from '@/scene/wisdom-config';
import type { WisdomScene } from '@/scene/wisdom-scene';
import { isLayerPage } from '@/lib/page-layers';
import { markRendered, onRenderScale, renderScale } from '@/lib/quality';

const TASKS: PreloadTask[] = ['wisdom-code', 'wisdom-data', 'wisdom-model', 'wisdom-compile'];
const MAX_PIXEL_RATIO = 2;
// Shares of the full-screen resolution: the smallest one with 1.5 canvas pixels per drawn pixel (as sharp as full).
const DETAIL = [0.5, 0.75, 1];
const OVERSAMPLE = 1.5;
const DETAIL_HYSTERESIS = 1.15;

const detailFor = (shown: number) => DETAIL.find((d) => d >= shown * OVERSAMPLE) ?? 1;

/**
 * The REF_129 shelf in the gallery's middle tile, scrubbed by `progress` (the zoom into it, set by the gallery).
 * The canvas is drawn at the size the tile reaches when it covers the screen and scaled down into it,
 * so it is sharp at the end of the zoom. While the tile is smaller, it renders fewer pixels.
 */
export function useWisdomScene(
  section: RefObject<HTMLElement | null>,
  tile: RefObject<HTMLElement | null>,
  progress: RefObject<number>,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<WisdomScene | null>(null);
  const resizeRef = useRef(() => {});
  const last = useRef({ time: -1, width: 0, height: 0, ratio: 0, detail: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    // Sized ahead (during the preloader), so entering the section does not reallocate the render targets.
    const resize = () => {
      const current = scene.current;
      const box = tile.current;
      if (!current || !box) return;
      const state = last.current;
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const scale = Math.max(window.innerWidth / w, window.innerHeight / h);
      const width = Math.round(w * scale * dpr) / dpr;
      const height = Math.round(h * scale * dpr) / dpr;
      if (!state.detail) state.detail = detailFor(canvas.getBoundingClientRect().width / width);
      const ratio = dpr * state.detail * renderScale();
      if (width === state.width && height === state.height && ratio === state.ratio) return;
      Object.assign(state, { width, height, ratio, time: -1 });
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.transform = `scale(${w / width}, ${h / height})`;
      current.setSize(width, height, ratio);
      current.render();
    };
    resizeRef.current = resize;
    const stopScale = onRenderScale(resize);
    window.addEventListener('resize', resize);

    import('@/scene/wisdom-scene')
      .then(({ createWisdomScene }) => {
        finishTask('wisdom-code');
        return createWisdomScene(canvas);
      })
      .then((created) => {
        if (disposed) return created.dispose();
        scene.current = created;
        resize();
        canvas.classList.add('is-ready');
        if (process.env.NODE_ENV === 'development')
          Object.assign(window, { __kelvWisdom: created, __WISDOM_LOOK: WISDOM_LOOK });
      })
      .catch((error: unknown) => {
        for (const task of TASKS) finishTask(task);
        console.error('[wisdom scene]', error);
      });

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      stopScale();
      scene.current?.dispose();
      scene.current = null;
    };
  }, [tile]);

  useFrame(() => {
    const current = scene.current;
    const host = section.current;
    if (!current || !host || isLayerPage()) return;
    const vh = window.innerHeight;
    const rect = host.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= vh) return;

    const state = last.current;
    const canvas = canvasRef.current;
    const shown = canvas ? canvas.getBoundingClientRect().width / state.width : 1;
    const detail = detailFor(shown);
    // Steps down only well below the threshold, so scrolling back and forth on it does not reallocate.
    if (detail > state.detail || detailFor(shown * DETAIL_HYSTERESIS) < state.detail) {
      state.detail = detail;
      resizeRef.current();
    }
    const time = Math.round(clamp01(progress.current) * current.duration * 1000) / 1000;
    if (time === state.time) return;
    state.time = time;
    current.setTime(time);
    current.render();
    markRendered();
  });

  return canvasRef;
}
