'use client';

import { TickBar } from '@/components/ui/TickBar';
import { frameScroll, viewportSize } from '@/lib/layout';

// Full when the footer fills the screen; the hero copy after it does not count.
function pageProgress() {
  const { pageHeight, height } = viewportSize();
  const max = pageHeight - 2 * height;
  return max > 0 ? frameScroll() / max : 0;
}

/** Header tick bar, lit with the page's scroll progress. */
export function Ticks() {
  return <TickBar progress={pageProgress} />;
}
