'use client';

import { TickBar } from '@/components/ui/TickBar';

// Full when the footer fills the screen; the hero copy after it does not count.
function pageProgress() {
  const max = document.documentElement.scrollHeight - 2 * window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
}

/** Header tick bar, lit with the page's scroll progress. */
export function Ticks() {
  return <TickBar progress={pageProgress} />;
}
