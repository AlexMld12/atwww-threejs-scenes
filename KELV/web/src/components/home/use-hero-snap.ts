'use client';

import { useEffect } from 'react';
import { designScale, easeOutCubic } from '@/lib/math';
import { useScroll } from '@/lib/scroll';

const IDLE_MS = 140;
const MAX_DISTANCE = 350;
const DURATION_S = 1.2;

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
        if (y <= 2 || y >= MAX_DISTANCE * designScale() || lenis.isScrolling) return;
        snapping = true;
        const release = () => {
          snapping = false;
        };
        lenis.scrollTo(0, { duration: DURATION_S, easing: easeOutCubic, onComplete: release });
        // onComplete does not fire when the user interrupts the snap.
        setTimeout(release, DURATION_S * 1000 + 200);
      }, IDLE_MS);
    };

    const unsubscribe = lenis.on('scroll', onScroll);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [lenis]);
}
