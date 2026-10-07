'use client';

import { useEffect, useRef } from 'react';
import { cx, resolveLength, snapToDevicePixels } from '@/lib/css';
import { STAGES } from '@/analysis/logic';

const STEP_MS = 14;

interface StageTicksProps {
  /** Progress of each stage, 0…1. */
  progress: number[];
  active: number;
  /** Changes whenever the panel becomes visible, so the bars are measured at their real width. */
  measureKey: unknown;
  instant: boolean;
}

/**
 * The four stage bars. Like the header bar, ticks are snapped to whole device pixels (the
 * design's 4 px on a 6.305 px pitch), and they light up one by one, like a counter.
 */
export function StageTicks({ progress, active, measureKey, instant }: StageTicksProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const counters = useRef(STAGES.map(() => ({ total: 0, lit: 0, target: 0, frame: 0 })));
  const latest = useRef(progress);

  useEffect(() => {
    latest.current = progress;
  });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      if (!list.offsetWidth) return;
      const dpr = window.devicePixelRatio || 1;
      const width = snapToDevicePixels(resolveLength(list, '--sa-tick-w'));
      const pitch = snapToDevicePixels(resolveLength(list, '--sa-tick-pitch'));
      const height = snapToDevicePixels(resolveLength(list, '--sa-tick-h'));
      bars.current.forEach((bar, i) => {
        if (!bar?.parentElement) return;
        const length = Math.floor(bar.parentElement.getBoundingClientRect().width * dpr) / dpr;
        bar.style.setProperty('--tk-w', `${width}px`);
        bar.style.setProperty('--tk-p', `${pitch}px`);
        bar.style.setProperty('--tk-h', `${height}px`);
        bar.style.setProperty('--tk-len', `${length}px`);
        const counter = counters.current[i];
        counter.total = Math.floor((length - width) / pitch) + 1;
        counter.target = counter.lit = Math.round(latest.current[i] * counter.total);
        bar.style.setProperty('--lit', String(counter.lit));
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measureKey]);

  useEffect(() => {
    progress.forEach((fraction, i) => {
      const counter = counters.current[i];
      const bar = bars.current[i];
      if (!bar) return;
      counter.target = Math.round(fraction * counter.total);
      cancelAnimationFrame(counter.frame);
      if (instant) {
        counter.lit = counter.target;
        bar.style.setProperty('--lit', String(counter.lit));
        return;
      }
      let last = performance.now();
      const tick = (now: number) => {
        const steps = Math.floor((now - last) / STEP_MS);
        if (steps > 0) {
          last += steps * STEP_MS;
          const remaining = counter.target - counter.lit;
          counter.lit += Math.sign(remaining) * Math.min(steps, Math.abs(remaining));
          bar.style.setProperty('--lit', String(counter.lit));
        }
        if (counter.lit !== counter.target) counter.frame = requestAnimationFrame(tick);
      };
      counter.frame = requestAnimationFrame(tick);
    });
  }, [progress, instant]);

  return (
    <ol ref={listRef} className="sa-stages">
      {STAGES.map((stage, i) => (
        <li key={stage.label} className={cx('sa-stage', i === active && 'is-active')}>
          <span className="sa-stage__label mono">{stage.label}</span>
          <span
            ref={(el) => {
              bars.current[i] = el;
            }}
            className="sa-ticks"
          >
            <span className="sa-ticks__lit" />
          </span>
        </li>
      ))}
    </ol>
  );
}
