'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { clamp01 } from '@/lib/math';
import { finishTask, type PreloadTask } from '@/lib/preload';
import { useFrame } from '@/lib/scroll';
import { WISDOM_LOOK } from '@/scene/wisdom-config';
import type { WisdomScene } from '@/scene/wisdom-scene';
import { isLayerPage } from '@/lib/page-layers';

const TASKS: PreloadTask[] = ['wisdom-code', 'wisdom-data', 'wisdom-model', 'wisdom-compile'];
const MAX_PIXEL_RATIO = 2;

/**
 * The REF_129 shelf in the gallery's middle tile, scrubbed by the whole pass of the section.
 * The canvas is drawn at the size the tile reaches when it covers the screen and scaled down into it,
 * so it is sharp at the end of the zoom.
 */
export function useWisdomScene(section: RefObject<HTMLElement | null>, tile: RefObject<HTMLElement | null>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<WisdomScene | null>(null);
  const last = useRef({ time: -1, width: 0, height: 0, dpr: 0 });

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
      if (width === state.width && height === state.height && dpr === state.dpr) return;
      Object.assign(state, { width, height, dpr, time: -1 });
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.transform = `scale(${w / width}, ${h / height})`;
      current.setSize(width, height, dpr);
      current.render();
    };
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
    // From the section's top entering the screen to the end of its sticky part.
    const progress = clamp01((vh - rect.top) / rect.height);
    const time = Math.round(progress * current.duration * 1000) / 1000;
    if (time === state.time) return;
    state.time = time;
    current.setTime(time);
    current.render();
  });

  return canvasRef;
}
