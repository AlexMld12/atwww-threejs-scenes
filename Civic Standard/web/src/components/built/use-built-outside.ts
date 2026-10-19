import { useEffect, type RefObject } from 'react';
import { designPx } from '@/lib/design';
import { activeAt, bodyAt, introAt, maskAt, TIMELINE, titleAt } from './timeline';

const MASK_OPACITY = 0.6;
const PHOTO_ZOOM_IN = 0.12;
const INTRO_RISE = 24;
const BODY_SHIFT = 16;
// The navbar comes back this many screens before the stage has scrolled away.
const NAV_RETURN = 0.5;

/** Drives BUILT OUTSIDE from the scroll: the mask on the hero's photo, the content's reveal, then each item. */
export function useBuiltOutside(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = root.current!;
    const stage = section.querySelector<HTMLElement>('.built__stage')!;
    const mask = section.querySelector<HTMLElement>('.built__mask')!;
    const bar = section.querySelector<HTMLElement>('.built__bar')!;
    const reveals = [...section.querySelectorAll<HTMLElement>('[data-reveal]')];
    const photos = [...section.querySelectorAll<HTMLElement>('.built__photo')].map((photo) => {
      const image = photo.querySelector('img')!;
      return { photo, image, zoom: Number(image.style.scale) || 1 };
    });
    const items = [...section.querySelectorAll<HTMLElement>('.built__item')].map((item) => ({
      item,
      heading: [item.querySelector<HTMLElement>('.built__number')!, item.querySelector<HTMLElement>('.built__title')!],
      body: item.querySelector<HTMLElement>('.built__body')!,
    }));
    const html = document.documentElement;
    let frame = 0;

    const update = () => {
      frame = requestAnimationFrame(update);
      const height = stage.clientHeight || window.innerHeight;
      const screens = -section.getBoundingClientRect().top / height;

      // Under the hero until the hero's photo is full screen: then this stage, with the same photo, is on top.
      stage.style.visibility = screens >= 0 ? 'visible' : 'hidden';
      html.classList.toggle('is-nav-hidden', screens >= 0 && screens < TIMELINE.pinned + 1 - NAV_RETURN);
      if (screens < 0) return;

      mask.style.opacity = String(MASK_OPACITY * maskAt(screens));
      const intro = introAt(screens);
      const rise = designPx(INTRO_RISE) * (1 - intro);
      reveals.forEach((element) => {
        element.style.opacity = String(intro);
        element.style.marginTop = `${rise}px`;
      });

      const active = activeAt(screens);
      const start = designPx(70);
      bar.style.width = `${start + (window.innerWidth - start) * (active / (items.length - 1))}px`;

      photos.forEach(({ photo, image, zoom }, k) => {
        if (k === 0) return;
        const shown = Math.min(1, Math.max(0, active - (k - 1)));
        photo.style.clipPath = `inset(${(1 - shown) * 100}% 0 0 0)`;
        image.style.scale = String(zoom * (1 + PHOTO_ZOOM_IN * (1 - shown)));
      });

      items.forEach(({ item, heading, body }, k) => {
        const title = titleAt(k, active, height);
        item.style.top = `${title.top + rise}px`;
        heading.forEach((element) => (element.style.opacity = String(title.opacity * intro)));
        const shown = bodyAt(k, active);
        body.style.opacity = String(shown * intro);
        body.style.marginTop = `${designPx(BODY_SHIFT) * (1 - shown) * Math.sign(k - active)}px`;
        body.style.visibility = shown > 0 ? 'visible' : 'hidden';
      });
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      html.classList.remove('is-nav-hidden');
    };
  }, [root]);
}
