'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { easeOutCubic } from '@/lib/math';
import { useFrame, useScroll } from '@/lib/scroll';

/**
 * Writes the part of the screen covered by light sections to `--lb-a` / `--lb-b`, which
 * clip the dark copy of the header (Chrome). `end` is how far down the section stays light.
 */
export function useLightBand(sections: { ref: RefObject<HTMLElement | null>; end: number }[]) {
  const last = useRef({ top: -1, bottom: -1 });
  useFrame(() => {
    const vh = window.innerHeight;
    let top = Infinity;
    let bottom = -Infinity;
    for (const { ref, end } of sections) {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) continue;
      const from = Math.max(0, rect.top);
      const to = Math.min(vh, rect.top + rect.height * end);
      if (to > from) {
        top = Math.min(top, from);
        bottom = Math.max(bottom, to);
      }
    }
    if (top === Infinity) top = bottom = 0;
    if (top === last.current.top && bottom === last.current.bottom) return;
    last.current = { top, bottom };
    const root = document.documentElement.style;
    root.setProperty('--lb-a', `${top.toFixed(2)}px`);
    root.setProperty('--lb-b', `${bottom.toFixed(2)}px`);
  });
}

const SNAP_IDLE_MS = 140;
const SNAP_MAX = 350;
const SNAP_DURATION_S = 1.2;

/** A short scroll down from the hero that stops is taken back to the very top. */
export function useHeroSnap() {
  const { lenis } = useScroll();

  useEffect(() => {
    if (!lenis) return;
    let timer: ReturnType<typeof setTimeout>;
    let snapping = false;
    const onScroll = () => {
      clearTimeout(timer);
      if (snapping) return;
      timer = setTimeout(() => {
        if (document.documentElement.classList.contains('sa-on')) return;
        const y = lenis.scroll;
        const max = SNAP_MAX * Math.max(1, window.innerWidth / 1720);
        if (y <= 2 || y >= max || lenis.isScrolling) return;
        snapping = true;
        lenis.scrollTo(0, {
          duration: SNAP_DURATION_S,
          easing: easeOutCubic,
          onComplete: () => {
            snapping = false;
          },
        });
        // onComplete does not fire if the user interrupts the animation.
        setTimeout(() => {
          snapping = false;
        }, SNAP_DURATION_S * 1000 + 200);
      }, SNAP_IDLE_MS);
    };
    const unsubscribe = lenis.on('scroll', onScroll);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [lenis]);
}
