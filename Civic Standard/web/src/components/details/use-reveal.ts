import { useEffect, type RefObject } from 'react';

// Played once, as the reference's statements are (fluid.glass, BaseHeading): each block starts when its top reaches
// 85 % of the screen, a little later than theirs ("top bottom") so it is seen; it never plays back.
const ROOT_MARGIN = '0px 0px -15% 0px';

/** Marks each [data-reveal] element `is-in` as it comes into view; details.css runs the motion. */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    // a [data-reveal-own] part plays its own reveals (the slider's cards)
    const elements = [...root.current!.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
      (element) => !element.closest('[data-reveal-own]'),
    );
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach(({ isIntersecting, target }) => {
          if (!isIntersecting) return;
          target.classList.add('is-in');
          observer.unobserve(target);
        }),
      { rootMargin: ROOT_MARGIN },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [root]);
}
