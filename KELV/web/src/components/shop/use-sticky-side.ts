'use client';

import { useEffect, useRef } from 'react';

/**
 * The product info column sticks under the header; when it is taller than the screen it scrolls first and
 * sticks by its bottom edge, so all of it is seen while the images pass.
 */
export function useStickySide<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    const header = document.querySelector<HTMLElement>('.shop-head');
    if (!element) return;
    const place = () => {
      const top = header?.offsetHeight ?? 0;
      element.style.top = `${Math.min(top, window.innerHeight - element.offsetHeight)}px`;
    };
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, []);
  return ref;
}
