import { KelvElement } from '@/lib/element';
import { designScale, easeOutCubic, isMobile } from '@/lib/math';
import { isLayerPage } from '@/lib/page-layers';
import { getLenis } from '@/lib/scroll';
import { observeReveals } from '@/ui/reveal';

const IDLE_MS = 140;
const MAX_DISTANCE = 350;
const DURATION_S = 1.2;

/** The hero section: its reveals, and a short scroll down from it that stops is taken back to the very top. */
export class Hero extends KelvElement {
  protected mount() {
    this.cleanup(observeReveals(this));
    const lenis = getLenis();
    if (!lenis) return;
    let timer: ReturnType<typeof setTimeout>;
    let snapping = false;

    const onScroll = () => {
      clearTimeout(timer);
      if (snapping) return;
      timer = setTimeout(() => {
        // Touch scrolls in short flicks: snapping back would trap the reader in the hero.
        if (isLayerPage() || isMobile()) return;
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
    this.cleanup(() => {
      clearTimeout(timer);
      unsubscribe();
    });
  }
}
