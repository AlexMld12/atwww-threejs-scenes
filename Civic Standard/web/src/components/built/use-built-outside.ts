import { useEffect, type RefObject } from 'react';
import { clamp01, designPx } from '@/lib/design';
import { setScrollStops } from '@/lib/scroll';
import { arrivedAt, INACTIVE, photoAt, positionAt, revealAt, STOPS, TIMELINE, titleAt } from './timeline';

const REVEAL_RISE = 24;
// The navbar comes back this many screens before the stage has scrolled away.
const NAV_RETURN = 0.5;
// Once a title is in its place, on its own clock as in the reference (SplitText lines, expo.out): it lights up,
// then its lines come up one by one. Leaving, it dims and its text fades at once.
const LIGHT_S = 1;
const DIM_S = 0.4;
const LINE_RISE = 40;
const LINE_S = 1.6;
const LINE_DELAY_S = 0.1;
const LINE_STAGGER_S = 0.1;
const FADE_OUT_S = 0.3;
// The buttons come in with the text, not after it: they are not a line of it, and rising from 40 px under its last
// line they seemed to run into it. A short rise, quick, from the first line's start.
const ACTIONS_RISE = 12;
const ACTIONS_S = 0.7;

const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Drives BUILT OUTSIDE from the scroll: the reveal, the titles and photos, and each item's text once it arrives. */
export function useBuiltOutside(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = root.current!;
    const stage = section.querySelector<HTMLElement>('.built__stage')!;
    const bar = section.querySelector<HTMLElement>('.built__bar')!;
    const reveals = [...section.querySelectorAll<HTMLElement>('[data-reveal]')];
    const photos = [...section.querySelectorAll<HTMLElement>('.built__photo')];
    const items = [...section.querySelectorAll<HTMLElement>('.built__item')].map((item) => ({
      item,
      heading: [item.querySelector<HTMLElement>('.built__number')!, item.querySelector<HTMLElement>('.built__title')!],
      body: item.querySelector<HTMLElement>('.built__body')!,
      lines: [...item.querySelectorAll<HTMLElement>('[data-line]')],
      // How lit the title is (0 = INACTIVE, 1 = full) when it last arrived or left, and when that was.
      light: 0,
      lightFrom: 0,
      changedAt: -Infinity,
    }));
    const html = document.documentElement;
    let arrived = -1;
    let frame = 0;
    // under another page (hidden): no stops, no hold on the navbar
    const shown = () => section.offsetParent !== null;
    const removeStops = setScrollStops(() => {
      if (!shown()) return [];
      const top = section.getBoundingClientRect().top + window.scrollY;
      const height = stage.clientHeight || window.innerHeight;
      return STOPS.map((screens) => top + screens * height);
    });

    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      if (!shown()) return html.classList.remove('is-nav-hidden');
      const height = stage.clientHeight || window.innerHeight;
      const screens = -section.getBoundingClientRect().top / height;

      // Under the hero until the hero's photo is full screen: then this stage, with the same photo, is on top.
      stage.style.visibility = screens >= 0 ? 'visible' : 'hidden';
      html.classList.toggle('is-nav-hidden', screens >= 0 && screens < TIMELINE.pinned + 1 - NAV_RETURN);
      if (screens < 0) return;

      const reveal = revealAt(screens);
      reveals.forEach((element) => {
        element.style.opacity = String(reveal);
        element.style.marginTop = `${designPx(REVEAL_RISE) * (1 - reveal)}px`;
      });

      // The photo is neither moved nor scaled, only uncovered by a hard edge rising with the scroll.
      photos.forEach((photo, k) => {
        if (k > 0) photo.style.clipPath = `inset(${(1 - photoAt(k, screens)) * 100}% 0 0 0)`;
      });

      const position = positionAt(screens);
      bar.style.width = `${(window.innerWidth * (position + 1)) / items.length}px`;

      const next = arrivedAt(position);
      if (next !== arrived) {
        items.forEach((entry, k) => {
          if (k !== arrived && k !== next) return;
          entry.lightFrom = entry.light;
          entry.changedAt = now;
        });
        arrived = next;
      }

      items.forEach((entry, k) => {
        const { item, heading, body, lines } = entry;
        const t = (now - entry.changedAt) / 1000;
        const title = titleAt(k, position, height);
        item.style.top = `${title.top}px`;

        const here = k === arrived;
        const u = here ? expoOut(clamp01(t / LIGHT_S)) : clamp01(t / DIM_S);
        entry.light = entry.lightFrom + ((here ? 1 : 0) - entry.lightFrom) * u;
        const opacity = title.opacity + (1 - INACTIVE) * entry.light;
        heading.forEach((element) => (element.style.opacity = String(opacity * reveal)));

        if (here) {
          body.style.visibility = 'visible';
          body.style.opacity = '1';
          lines.forEach((line, j) => {
            const actions = line.dataset.line === 'actions';
            const p = actions
              ? expoOut(clamp01((t - LINE_DELAY_S) / ACTIONS_S))
              : expoOut(clamp01((t - LINE_DELAY_S - j * LINE_STAGGER_S) / LINE_S));
            line.style.opacity = String(p);
            line.style.top = `${designPx(actions ? ACTIONS_RISE : LINE_RISE) * (1 - p)}px`;
          });
        } else {
          // Only the item that just left fades; the others are already hidden.
          const left = Number.isFinite(t) && entry.lightFrom > 0 ? 1 - clamp01(t / FADE_OUT_S) : 0;
          body.style.opacity = String(left);
          body.style.visibility = left > 0 ? 'visible' : 'hidden';
        }
      });
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      removeStops();
      html.classList.remove('is-nav-hidden');
    };
  }, [root]);
}
