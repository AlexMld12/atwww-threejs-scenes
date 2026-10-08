'use client';

import { useRef, type RefObject } from 'react';
import { setChromeVar } from '@/components/chrome/chrome-vars';
import { useFrame } from '@/lib/scroll';

export interface LightSection {
  ref: RefObject<HTMLElement | null>;
  /** Share of the section's height that is light, from its top. */
  end: number;
}

/** Clips the dark header copy to the part of the screen over light sections. */
export function useLightBand(sections: LightSection[]) {
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
    setChromeVar('--lb-a', `${top.toFixed(2)}px`);
    setChromeVar('--lb-b', `${bottom.toFixed(2)}px`);
  });
}
