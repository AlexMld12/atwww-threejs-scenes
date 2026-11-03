import { setChromeVar } from '@/chrome/chrome-vars';
import { layoutVersion, viewRect, viewportSize } from '@/lib/layout';

/** The light sections, by id, with the share of their height that is light from their top. */
const LIGHT_SECTIONS = [
  { id: 'join', end: 1 },
  // Zone 8 turns navy over its last 560 of 1042 design px (travel.css): the header flips halfway through.
  { id: 'travel', end: 0.73 },
];

/** Clips the dark header copy to the part of the screen over the light sections. */
export function lightBand() {
  let version = -1;
  let sections: { element: HTMLElement; end: number }[] = [];
  let last = { top: -1, bottom: -1 };

  return () => {
    if (version !== layoutVersion()) {
      version = layoutVersion();
      sections = LIGHT_SECTIONS.flatMap(({ id, end }) => {
        const element = document.getElementById(id);
        return element ? [{ element, end }] : [];
      });
    }
    const vh = viewportSize().height;
    let top = Infinity;
    let bottom = -Infinity;
    for (const { element, end } of sections) {
      const rect = viewRect(element);
      const from = Math.max(0, rect.top);
      const to = Math.min(vh, rect.top + rect.height * end);
      if (to > from) {
        top = Math.min(top, from);
        bottom = Math.max(bottom, to);
      }
    }
    if (top === Infinity) top = bottom = 0;
    if (top === last.top && bottom === last.bottom) return;
    last = { top, bottom };
    setChromeVar('--lb-a', `${top.toFixed(2)}px`);
    setChromeVar('--lb-b', `${bottom.toFixed(2)}px`);
  };
}
