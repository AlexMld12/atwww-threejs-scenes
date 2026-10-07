'use client';

import { useEffect, useRef } from 'react';
import { clamp01 } from '@/lib/math';
import { resolveLength, snapToDevicePixels, watchPixelRatio } from '@/lib/css';
import { useFrame } from '@/lib/scroll';

/**
 * The header tick bar, lit tick by tick with the scroll progress of the whole page.
 * The design's 1.5 px ticks on a 6.5 px pitch fall on half pixels, so width, pitch, height
 * and origin are snapped to whole device pixels; otherwise ticks render 1 or 2 px wide.
 */
export function Ticks() {
  const ref = useRef<HTMLDivElement>(null);
  const total = useRef(0);
  const lit = useRef(-1);

  useEffect(() => {
    const bar = ref.current;
    const header = bar?.parentElement;
    if (!bar || !header) return;

    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      const pad = resolveLength(header, '--pad-edge');
      const width = snapToDevicePixels(resolveLength(header, '--tick-w'));
      const pitch = snapToDevicePixels(resolveLength(header, '--tick-pitch'));
      const height = snapToDevicePixels(resolveLength(header, '--tick-h'));
      const x = snapToDevicePixels(pad);
      const length = Math.floor((document.documentElement.clientWidth - pad - x) * dpr) / dpr;
      const style = bar.style;
      style.setProperty('--tk-w', `${width}px`);
      style.setProperty('--tk-p', `${pitch}px`);
      style.setProperty('--tk-h', `${height}px`);
      style.setProperty('--tk-x', `${x}px`);
      style.setProperty('--tk-y', `${x}px`);
      style.setProperty('--tk-len', `${length}px`);
      total.current = Math.floor((length - width) / pitch) + 1;
      lit.current = -1;
    };

    measure();
    window.addEventListener('resize', measure);
    const unwatch = watchPixelRatio(measure);
    return () => {
      window.removeEventListener('resize', measure);
      unwatch();
    };
  }, []);

  useFrame(() => {
    // The bar is full when the footer fills the screen; the hero copy after it is excluded.
    const max = document.documentElement.scrollHeight - 2 * window.innerHeight;
    const progress = max > 0 ? clamp01(window.scrollY / max) : 0;
    const next = Math.round(progress * total.current);
    if (next === lit.current || !ref.current) return;
    lit.current = next;
    ref.current.style.setProperty('--ticks-lit', String(next));
  });

  return (
    <div ref={ref} className="ticks" aria-hidden="true">
      <span className="ticks__lit" />
    </div>
  );
}
