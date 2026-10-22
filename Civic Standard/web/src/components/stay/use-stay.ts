import { useEffect, type RefObject } from 'react';
import { clamp01, easeInOut } from '@/lib/design';

// All tied to the (Lenis-smoothed) scroll, over the part of the way that is seen: from the section's top entering at
// the bottom of the screen to the whole section on screen (the page's end). Over it the photo zooms in from Figma's
// framing (ZOOM_FROM) to ZOOM_TO, easing in and out so most of it happens with most of the photo in view; it lags the
// page by LAG of the way (nearly fixed: it comes into place rather than scrolling in), and the mask opens to Figma's
// 50 %. The line and the buttons rise once the section is REVEAL_AT of the way in.
const ZOOM_FROM = 1;
const ZOOM_TO = 1.18;
const LAG = 0.35;
const MASK_FROM = 0.72;
const MASK_TO = 0.5;
const REVEAL_AT = 0.5;

export function useStay(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = root.current!;
    const photo = section.querySelector<HTMLElement>('.st__photo')!;
    const mask = section.querySelector<HTMLElement>('.st__mask')!;
    const reveals = [...section.querySelectorAll<HTMLElement>('[data-reveal]')];
    let visible = false;
    let frame = 0;
    const observer = new IntersectionObserver((entries) => (visible = entries.at(-1)!.isIntersecting));
    observer.observe(section);

    const update = () => {
      frame = requestAnimationFrame(update);
      if (!visible) return;
      const { top, height } = section.getBoundingClientRect();
      const screen = window.innerHeight;
      const way = Math.min(height, screen);
      const seen = clamp01((screen - top) / way);
      // up by LAG of what is left to come in: its foot always stays below the screen's, so no edge shows
      const lag = -LAG * Math.max(0, top - (screen - height));
      const zoom = ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * easeInOut(seen);
      photo.style.transform = `translate3d(0, ${lag}px, 0) scale(${zoom})`;
      mask.style.opacity = String(MASK_FROM + (MASK_TO - MASK_FROM) * seen);
      if (seen >= REVEAL_AT) reveals.forEach((element) => element.classList.add('is-in'));
    };
    frame = requestAnimationFrame(update);

    // On hover the arrow leaves to the right and comes back from the left (as FROM THE RANGE's); leaving the button
    // mid-way plays it back from where it is instead of snapping home.
    const actions = section.querySelector<HTMLElement>('.st__actions')!;
    const icon = actions.querySelector<SVGElement>('.st__arrow svg')!;
    let nudge: Animation | null = null;
    const onEnter = () => {
      if (nudge && nudge.playState === 'running') return nudge.playbackRate < 0 ? nudge.reverse() : undefined;
      nudge = icon.animate(
        [
          { transform: 'translateX(0)', easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)' },
          { transform: 'translateX(200%)', offset: 0.5 },
          { transform: 'translateX(-200%)', offset: 0.5, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 1000 },
      );
    };
    const onLeave = () => {
      if (nudge?.playState === 'running' && nudge.playbackRate > 0) nudge.reverse();
    };
    actions.addEventListener('pointerenter', onEnter);
    actions.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      actions.removeEventListener('pointerenter', onEnter);
      actions.removeEventListener('pointerleave', onLeave);
    };
  }, [root]);
}
