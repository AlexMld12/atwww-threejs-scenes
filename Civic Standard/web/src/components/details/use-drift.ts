import { useEffect, type RefObject } from 'react';
import { clamp01, designPx } from '@/lib/design';

// The bench drawing drifts to the right as the page scrolls past it: from DRIFT px left of its Figma place as it comes
// in at the bottom of the screen to DRIFT px right of it as it leaves at the top (at its place mid-screen).
const DRIFT = 90;

/** Horizontal parallax of one element, tied to its position on the screen (transform, so it is only an image). */
export function useDrift(target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = target.current!;
    let visible = false;
    let frame = 0;
    // One call can carry several entries (a jump in and out): the last one is the state now. The section is watched,
    // not the element: under its reveal (a clip-path) the element counts as unseen, and it would only start drifting
    // (with a jump) once uncovered; it drifts from the start, while it is being uncovered.
    const observer = new IntersectionObserver((entries) => (visible = entries.at(-1)!.isIntersecting));
    observer.observe(element.closest('section') ?? element);

    const update = () => {
      frame = requestAnimationFrame(update);
      if (!visible) return;
      const { top, height } = element.getBoundingClientRect();
      // the layout box: the transform only moves it sideways
      const progress = clamp01((window.innerHeight - top) / (window.innerHeight + height));
      element.style.transform = `translateX(${(progress * 2 - 1) * designPx(DRIFT)}px)`;
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [target]);
}
