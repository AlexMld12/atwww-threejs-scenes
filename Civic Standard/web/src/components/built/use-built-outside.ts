import { useEffect, type RefObject } from 'react';
import { clamp01, designPx } from '@/lib/design';
import { indexAt, introAt, maskAt, photoAt, slot, TIMELINE } from './timeline';

const MASK_OPACITY = 0.6;
const INTRO_RISE = 24;
// The navbar comes back this many screens before the stage has scrolled away.
const NAV_RETURN = 0.5;
// Text runs on its own clock once the item changes, as in the reference (SplitText lines, expo.out).
const TITLE_S = 1.4;
const LINE_RISE = 40;
const LINE_S = 1.6;
const LINE_DELAY_S = 0.1;
const LINE_STAGGER_S = 0.1;
const FADE_OUT_S = 0.2;

const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Drives BUILT OUTSIDE: the mask on the hero's photo, the content's reveal, then each item. */
export function useBuiltOutside(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = root.current!;
    const stage = section.querySelector<HTMLElement>('.built__stage')!;
    const mask = section.querySelector<HTMLElement>('.built__mask')!;
    const bar = section.querySelector<HTMLElement>('.built__bar')!;
    const reveals = [...section.querySelectorAll<HTMLElement>('[data-reveal]')];
    const photos = [...section.querySelectorAll<HTMLElement>('.built__photo')];
    const items = [...section.querySelectorAll<HTMLElement>('.built__item')].map((item) => ({
      item,
      heading: [item.querySelector<HTMLElement>('.built__number')!, item.querySelector<HTMLElement>('.built__title')!],
      body: item.querySelector<HTMLElement>('.built__body')!,
      lines: [...item.querySelectorAll<HTMLElement>('[data-line]')],
      // The title moves from where it was when the item changed; -Infinity = already settled.
      from: { top: 0, opacity: 0 },
      title: { top: 0, opacity: 0 },
      changedAt: -Infinity,
      // Only the item that was shown fades out; the others stay hidden.
      fading: false,
    }));
    const html = document.documentElement;
    let index = -1;
    let frame = 0;

    const update = (now: number) => {
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

      // The photo is neither moved nor scaled, only uncovered by a hard edge rising with the scroll.
      let swept = 0;
      photos.forEach((photo, k) => {
        if (k === 0) return;
        const shown = photoAt(k, screens);
        swept += shown;
        photo.style.clipPath = `inset(${(1 - shown) * 100}% 0 0 0)`;
      });
      const start = designPx(70);
      bar.style.width = `${start + (window.innerWidth - start) * (swept / (photos.length - 1))}px`;

      const next = indexAt(screens);
      if (next !== index) {
        const first = index < 0;
        items.forEach((entry, k) => {
          entry.from = { ...entry.title };
          entry.fading = k === index;
          entry.changedAt = first ? -Infinity : now;
        });
        index = next;
      }

      items.forEach((entry, k) => {
        const { item, heading, body, lines, from } = entry;
        const t = (now - entry.changedAt) / 1000;
        const to = slot(k, index, height);
        const u = expoOut(clamp01(t / TITLE_S));
        entry.title = {
          top: from.top + (to.top - from.top) * u,
          opacity: from.opacity + (to.opacity - from.opacity) * u,
        };
        item.style.top = `${entry.title.top + rise}px`;
        heading.forEach((element) => (element.style.opacity = String(entry.title.opacity * intro)));

        if (k === index) {
          body.style.opacity = String(intro);
          body.style.visibility = 'visible';
          lines.forEach((line, j) => {
            const p = expoOut(clamp01((t - LINE_DELAY_S - j * LINE_STAGGER_S) / LINE_S));
            line.style.opacity = String(p);
            line.style.top = `${designPx(LINE_RISE) * (1 - p)}px`;
          });
        } else {
          const left = entry.fading ? 1 - clamp01(t / FADE_OUT_S) : 0;
          body.style.opacity = String(left * intro);
          body.style.visibility = left > 0 ? 'visible' : 'hidden';
        }
      });
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      html.classList.remove('is-nav-hidden');
    };
  }, [root]);
}
