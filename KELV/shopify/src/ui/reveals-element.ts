import { isDesignMode } from '@/lib/design-mode';
import { KelvElement } from '@/lib/element';
import { whenReady } from '@/lib/scroll';
import { observeReveals, resetReveals } from './reveal';

/**
 * Plays the `[data-reveal]` entrances of the markup inside it. Inside a page layer they wait for the layer's
 * entrance (`kelv:layer-enter`), which plays them again each time the layer slides in. In the theme editor there
 * are no layer entrances: they play at once, and again in a section the editor re-renders.
 */
export class RevealsElement extends KelvElement {
  protected mount() {
    const panel = this.closest<HTMLElement>('.page-layer');
    if (isDesignMode()) {
      // Once every element has built its markup (the policy page rebuilds its own).
      let stop = () => {};
      whenReady(() => (stop = observeReveals(this)));
      this.cleanup(() => stop());
      this.listen(document, 'shopify:section:load', (event) => {
        const section = event.target as HTMLElement;
        if (this.contains(section)) this.cleanup(observeReveals(section));
      });
      return;
    }
    if (!panel) {
      this.cleanup(observeReveals(this));
      return;
    }
    let stop = () => {};
    this.listen(panel, 'kelv:layer-enter', (event) => {
      stop();
      resetReveals(this);
      stop = observeReveals(this, (event as CustomEvent<{ delay: number }>).detail.delay);
    });
    this.cleanup(() => stop());
  }
}
