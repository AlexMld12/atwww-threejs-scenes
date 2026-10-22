'use client';

import { useRef, type CSSProperties } from 'react';
import { Lines } from '../details/Lines';
import { fromLeft, textTop } from '../details/place';
import { useReveal } from '../details/use-reveal';
import { RANGE } from './content';
import { useRange } from './use-range';

export function Range() {
  const root = useRef<HTMLElement>(null);
  useReveal(root);
  useRange(root);

  return (
    <section ref={root} className="dv range">
      <span className="dv__rule" data-reveal="rule" />
      <Lines
        as="h2"
        lines={['From the range']}
        className="dv__label"
        style={{ top: textTop('mono', 34, 12, 16.3), left: fromLeft(30) }}
      />
      <div className="range__arrows">
        <button type="button" className="range__arrow range__arrow--prev" aria-label="Previous products">
          <svg viewBox="0 0 12 11.2" aria-hidden="true">
            <path d="M12 5.6H1M5.8 0.8L1 5.6l4.8 4.8" />
          </svg>
        </button>
        <button type="button" className="range__arrow range__arrow--next" aria-label="Next products">
          <svg viewBox="0 0 12 11.2" aria-hidden="true">
            <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
          </svg>
        </button>
      </div>

      <div className="range__viewport" data-reveal-own>
        <ul className="range__track">
          {RANGE.map(({ id, title, caption }, i) => (
            <li key={id} className={`range__card range__card--${i % 2 ? 'short' : 'tall'}`}>
              <div className="range__image" data-reveal="image">
                {/* eslint-disable-next-line @next/next/no-img-element -- a fixed render, sized by the card */}
                <img src={`/range/${id}.webp`} alt="" draggable={false} />
              </div>
              {/* title and caption rise together, so neither waits for its own turn at the screen's bottom */}
              <div className="range__text" data-reveal="lines">
                <h3 className="line range__title" style={{ '--i': 0 } as CSSProperties}>
                  <span className="line__inner">{title}</span>
                </h3>
                <p className="line range__caption" style={{ '--i': 1 } as CSSProperties}>
                  <span className="line__inner">{caption}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
