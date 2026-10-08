'use client';

import { useEffect, useRef, useState } from 'react';
import { formatReading } from '@/analysis/logic';
import { easeOutCubic, prefersReducedMotion } from '@/lib/math';

const COUNT_MS = 450;

/** LIVE READING in the header, counting to each new value. */
export function LiveReading({ value }: { value: number | null }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (value === null || from.current === null || prefersReducedMotion()) {
      from.current = value;
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - start) / COUNT_MS);
      const current = origin + (value - origin) * easeOutCubic(k);
      from.current = current;
      setShown(Math.round(current * 10) / 10);
      if (k < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="sa-live__val">{shown === null ? '––.–' : formatReading(shown)}</span>;
}
