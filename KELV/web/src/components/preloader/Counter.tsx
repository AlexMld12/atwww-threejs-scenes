'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cx, type CSSVars } from '@/lib/css';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The big number: one rolling reel per digit, each as wide as the digit it shows (drinksom.eu). */
export function Counter({ value }: { value: number }) {
  const sizers = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const spans = sizers.current?.children;
      if (spans) setWidths([...spans].map((span) => span.getBoundingClientRect().width));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const reels = [Math.floor(value / 100) % 10, Math.floor(value / 10) % 10, value % 10];
  const shown = [value >= 100, value >= 10, true];

  return (
    <span className="ld-counter" aria-label={String(value)}>
      <span ref={sizers} className="ld-counter__sizers" aria-hidden="true">
        {DIGITS.map((digit) => (
          <span key={digit}>{digit}</span>
        ))}
      </span>
      {reels.map((digit, i) => {
        const width = shown[i] && widths ? `${widths[digit]}px` : shown[i] ? 'auto' : '0px';
        return (
          <span
            key={i}
            className={cx('ld-reel', !shown[i] && 'is-off')}
            style={{ width, '--digit': digit } as CSSVars}
            aria-hidden="true"
          >
            <span className="ld-reel__strip">
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
