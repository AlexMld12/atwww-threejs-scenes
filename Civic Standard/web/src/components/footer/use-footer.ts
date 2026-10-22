import { useEffect, type RefObject } from 'react';
import { clamp01 } from '@/lib/design';

// telhaclarke.com.au's footer timeline (ease none, scrubbed on the smoothed scroll): from the curtain's foot reaching
// the screen's foot to the end of the page, the band's content rises from RISE of its own height to its place and the
// veil over it fades from VEIL to 0. Figma's shadow under the curtain fades with it (gone once the band is all out).
const RISE = 0.4;
const VEIL = 0.85;

export function useFooter(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const footer = root.current!;
    const curtain = footer.querySelector<HTMLElement>('.pf')!;
    const band = footer.querySelector<HTMLElement>('.ft__band')!;
    const inner = footer.querySelector<HTMLElement>('.ft__inner')!;
    const veil = footer.querySelector<HTMLElement>('.ft__veil')!;
    let visible = false;
    let frame = 0;
    const observer = new IntersectionObserver((entries) => (visible = entries.at(-1)!.isIntersecting));
    observer.observe(band);

    const update = () => {
      frame = requestAnimationFrame(update);
      if (!visible) return;
      const travel = Math.max(band.offsetHeight, 1);
      const shown = band.getBoundingClientRect().bottom - curtain.getBoundingClientRect().bottom;
      const p = clamp01(shown / travel);
      // on `top`, not a transform: the copyright and the links stay sharp while they rise
      inner.style.top = `${RISE * inner.offsetHeight * (1 - p)}px`;
      veil.style.opacity = String(VEIL * (1 - p));
      curtain.style.setProperty('--ft-shade', String(1 - p));
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [root]);
}
