'use client';

import { useEffect, useRef } from 'react';
import { cx, measureTicks, resolveLength, snapToDevicePixels, watchPixelRatio } from '@/lib/css';
import { clamp01 } from '@/lib/math';
import { useFrame } from '@/lib/scroll';

interface TickBarProps {
  /** Progress 0…1, read every frame. */
  progress: () => number;
  /** Length token for the bar's top edge; the side padding by default. */
  topToken?: string;
  className?: string;
}

/** The tick bar of the header and the preloader, snapped to device pixels so all ticks match. */
export function TickBar({ progress, topToken = '--pad-edge', className }: TickBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const total = useRef(0);
  const lit = useRef(-1);

  useEffect(() => {
    const bar = ref.current;
    const host = bar?.parentElement;
    if (!bar || !host) return;

    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, pitch, height } = measureTicks(host, '--tick');
      const pad = resolveLength(host, '--pad-edge');
      const room = Math.floor((document.documentElement.clientWidth - 2 * pad) * dpr) / dpr;
      const y = snapToDevicePixels(resolveLength(host, topToken));
      const style = bar.style;
      style.setProperty('--tk-w', `${width}px`);
      style.setProperty('--tk-p', `${pitch}px`);
      style.setProperty('--tk-h', `${height}px`);
      style.setProperty('--tk-y', `${y}px`);
      total.current = Math.floor((room - width) / pitch) + 1;
      // Only whole ticks (a cut-off last one could never light up), centred so both ends match the margins.
      const length = (total.current - 1) * pitch + width;
      const x = snapToDevicePixels(pad + (room - length) / 2);
      style.setProperty('--tk-x', `${x}px`);
      style.setProperty('--tk-len', `${length}px`);
      lit.current = -1;
    };

    measure();
    window.addEventListener('resize', measure);
    const unwatch = watchPixelRatio(measure);
    return () => {
      window.removeEventListener('resize', measure);
      unwatch();
    };
  }, [topToken]);

  useFrame(() => {
    const next = Math.round(clamp01(progress()) * total.current);
    if (next === lit.current || !ref.current) return;
    lit.current = next;
    ref.current.style.setProperty('--ticks-lit', String(next));
  });

  return (
    <div ref={ref} className={cx('ticks', className)} aria-hidden="true">
      <span className="ticks__lit" />
    </div>
  );
}
