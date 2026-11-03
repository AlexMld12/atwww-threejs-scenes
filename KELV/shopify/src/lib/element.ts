import { onFrame } from './scroll';

type Cleanup = () => void;

/**
 * Base of the theme's custom elements. Shopify's theme editor replaces a section's markup when a setting changes,
 * so everything an element starts in `mount()` is undone through `cleanup()` when it leaves the page.
 */
export abstract class KelvElement extends HTMLElement {
  private cleanups: Cleanup[] = [];

  connectedCallback() {
    this.mount();
  }

  disconnectedCallback() {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  protected abstract mount(): void;

  protected cleanup(callback: Cleanup) {
    this.cleanups.push(callback);
  }

  protected frame(callback: (now: number) => void) {
    this.cleanup(onFrame(callback));
  }

  protected listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
  ): void;
  protected listen(target: EventTarget, type: string, listener: (event: Event) => void): void;
  protected listen(target: EventTarget, type: string, listener: (event: Event) => void) {
    target.addEventListener(type, listener);
    this.cleanup(() => target.removeEventListener(type, listener));
  }

  /** The child marked `data-part="<name>"`. */
  protected ref<T extends HTMLElement = HTMLElement>(name: string) {
    return this.querySelector<T>(`[data-part="${name}"]`);
  }
}

export function define(name: string, element: CustomElementConstructor) {
  if (!customElements.get(name)) customElements.define(name, element);
}
