/**
 * Layout reads for the frame loop without forcing layout. Sections do not move on the page while it scrolls,
 * so their boxes are measured once (again after a resize or a change of the page's height) and placed on screen
 * with the frame's scroll. A getBoundingClientRect() after another component's style write recomputed the layout
 * up to ~37 times a frame, the main cost of scrolling on phones.
 * Only for elements that are not inside a sticky or transformed ancestor.
 */

interface Box {
  version: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ViewRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

let version = 0;
let scroll = 0;
let viewport = { width: 0, height: 0, clientWidth: 0, pageHeight: 0, version: -1 };
const boxes = new WeakMap<Element, Box>();

/** Forgets every measurement: the next read measures again. */
export function invalidateLayout() {
  version++;
}

// Registered on import, before any component's own resize listener reads the viewport.
if (typeof window !== 'undefined') {
  window.addEventListener('resize', invalidateLayout);
  new ResizeObserver(invalidateLayout).observe(document.documentElement);
}

/** Called once per frame, after Lenis has scrolled and before anything writes a style. */
export function setFrameScroll() {
  scroll = window.scrollY;
}

/** The page's scroll position this frame. */
export const frameScroll = () => scroll;

function measureViewport() {
  if (viewport.version === version) return viewport;
  const root = document.documentElement;
  viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    clientWidth: root.clientWidth,
    pageHeight: root.scrollHeight,
    version,
  };
  return viewport;
}

/** Window size (innerWidth / innerHeight), the width without the scrollbar and the page's scroll height. */
export const viewportSize = () => measureViewport();

/** The element's box on screen this frame, as getBoundingClientRect() would return it. */
export function viewRect(element: Element): ViewRect {
  let box = boxes.get(element);
  if (!box || box.version !== version) {
    const rect = element.getBoundingClientRect();
    box = { version, top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height };
    boxes.set(element, box);
  }
  const top = box.top - scroll;
  return {
    top,
    bottom: top + box.height,
    left: box.left,
    right: box.left + box.width,
    width: box.width,
    height: box.height,
  };
}

/** Bumps whenever the measurements are dropped: for callers that cache a size of their own. */
export const layoutVersion = () => version;

const inSticky = new WeakMap<
  Element,
  { version: number; top: number; left: number; width: number; height: number; stickyHeight: number }
>();

/** viewRect() for an element inside a `position: sticky; top: 0` box, placed where the sticky box is this frame. */
export function viewRectInSticky(element: Element, sticky: HTMLElement): ViewRect {
  let box = inSticky.get(element);
  if (!box || box.version !== version) {
    const rect = element.getBoundingClientRect();
    const stickyRect = sticky.getBoundingClientRect();
    box = {
      version,
      top: rect.top - stickyRect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      stickyHeight: stickyRect.height,
    };
    inSticky.set(element, box);
  }
  const host = viewRect(sticky.parentElement!);
  const top = Math.min(Math.max(host.top, 0), host.bottom - box.stickyHeight) + box.top;
  return {
    top,
    bottom: top + box.height,
    left: box.left,
    right: box.left + box.width,
    width: box.width,
    height: box.height,
  };
}
