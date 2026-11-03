import { KelvElement } from '@/lib/element';
import { frameScroll, viewportSize } from '@/lib/layout';
import { startSweep } from '@/ui/sweep';
import { startTickBar } from '@/ui/tick-bar';
import { lightBand } from './light-band';

// Full when the footer fills the screen; the hero copy after it does not count.
function pageProgress() {
  const { pageHeight, height } = viewportSize();
  const max = pageHeight - 2 * height;
  return max > 0 ? frameScroll() / max : 0;
}

/** The home's fixed header and CTAs, twice: light, and dark (clipped to the light sections). */
export class Header extends KelvElement {
  protected mount() {
    for (const bar of this.querySelectorAll<HTMLElement>('.ticks')) this.cleanup(startTickBar(bar, pageProgress));
    for (const cta of this.querySelectorAll<HTMLElement>('.cta')) this.cleanup(startSweep(cta));
    this.frame(lightBand());
  }
}
