'use client';

import { useRef } from 'react';
import { designCss, topForBaseline } from '@/lib/design';
import { configure } from '@/lib/quote';
import { navigate } from '@/lib/routes';
import { useReveal } from '../details/use-reveal';
import { Roll } from '../ui/Roll';
import { nextSteps, type Page } from './content';
import { Picture } from './Picture';

// Figma: the title's baseline 52 below the card's top, the text's first 82 (31 / 36 and 14 / 18)
const TITLE_TOP = topForBaseline('sans', 52, 31, 36);
const TEXT_GAP = topForBaseline('sans', 82, 14, 18) - TITLE_TOP - 36;

const ACTIONS = [
  { label: 'Configure a row', view: 'row' as const, go: (page: Page) => configure({ id: page.id }) },
  { label: 'Browse the range', view: 'square' as const, go: () => navigate('products') },
];

// The two cards under the spec sheet's picture, Figma's crops of it (tools/blender_gallery.py): the text and the
// call to action over each. Motion: the pictures are uncovered from below, the text and the buttons rise a little.
export function ProductNext({ page }: { page: Page }) {
  const root = useRef<HTMLElement>(null);
  useReveal(root);

  return (
    <section ref={root} className="pn">
      {nextSteps(page).map(({ title, text }, i) => {
        const { label, view, go: action } = ACTIONS[i];
        const go = () => action(page);
        return (
          <Picture key={view} product={page.id} view={view} className="pn__card">
            <div className="pn__copy" style={{ top: designCss(TITLE_TOP) }}>
              <h3 className="pn__title" data-reveal="rise">
                {title}
              </h3>
              <p className="pn__text" data-reveal="rise" style={{ marginTop: designCss(TEXT_GAP) }}>
                {text}
              </p>
            </div>
            <div className="pn__actions">
              <div className="pn__buttons" data-reveal="rise">
                <button type="button" className="pill pn__button" aria-label={label} onClick={go}>
                  <Roll text={label} />
                </button>
                <button type="button" className="pill pill--icon pn__arrow" aria-label={label} onClick={go}>
                  <svg viewBox="0 0 12 11.2" aria-hidden="true">
                    <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
                  </svg>
                </button>
              </div>
            </div>
          </Picture>
        );
      })}
    </section>
  );
}
