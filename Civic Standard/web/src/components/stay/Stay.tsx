'use client';

import { useRef, type CSSProperties } from 'react';
import { fromLeft, textTop } from '../details/place';
import { Roll } from '../ui/Roll';
import { useStay } from './use-stay';

// Figma: Civic Standard.pdf 10126–10956, the planters' photo (BUILT OUTSIDE's second, the same file) under the
// night mask, the closing line and the quote buttons.
const TITLE = 'Civic Standard, built to stay.';

export function Stay() {
  const root = useRef<HTMLElement>(null);
  useStay(root);

  return (
    <section ref={root} className="st">
      <div className="st__frame" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- moved and scaled by use-stay, sized by the section */}
        <img className="st__photo" src="/built/2.webp" alt="" decoding="async" />
        <span className="st__mask" />
      </div>
      {/* each word rises in its own mask, as Solid · Civic · Calm, but once, on its own time, as the section comes in */}
      <h2
        className="st__title"
        style={{ top: textTop('sans', 791.7, 44, 44), left: fromLeft(30) }}
        aria-label={TITLE}
        data-reveal="words"
      >
        {TITLE.split(' ').map((word, i) => (
          <span key={i} className="st__word" aria-hidden="true">
            <span className="st__glyphs" style={{ '--i': i } as CSSProperties}>
              {word}
            </span>
          </span>
        ))}
      </h2>
      <div className="lines st__actions" data-reveal="lines">
        <span className="line">
          <span className="line__inner">
            <button type="button" className="pill pill--icon st__arrow" aria-label="Request a quote">
              <svg viewBox="0 0 12 11.2" aria-hidden="true">
                <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
              </svg>
            </button>
            <button type="button" className="pill st__quote">
              <Roll text="Request a quote" />
            </button>
          </span>
        </span>
      </div>
    </section>
  );
}
