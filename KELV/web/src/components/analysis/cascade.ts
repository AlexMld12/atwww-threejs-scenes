'use client';

import { useEffect, useState } from 'react';
import type { CSSVars } from '@/lib/css';

const STAGGER = 0.06;
const MAX_STEPS = 12;

/** True two frames after mount, once the hidden state has painted; remount to replay. */
export function useRevealed() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  return revealed;
}

/** Staggered `--d` delays for the `[data-sa-in]` items of one screen, in render order. */
export function cascade(delay: number) {
  let index = 0;
  return (): CSSVars => ({ '--d': `${(delay + Math.min(index++, MAX_STEPS) * STAGGER).toFixed(2)}s` });
}
