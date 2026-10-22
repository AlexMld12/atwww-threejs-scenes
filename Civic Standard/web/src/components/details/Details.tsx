'use client';

import { useRef } from 'react';
import { designCss } from '@/lib/design';
import { DETAILS } from './content';
import { Lines } from './Lines';
import { fromCentre, fromLeft, textTop } from './place';
import { useReveal } from './use-reveal';

export function Details() {
  const root = useRef<HTMLElement>(null);
  useReveal(root);

  return (
    <section ref={root} className="dv dv--details">
      <span className="dv__rule" data-reveal="rule" />
      <Lines
        as="h2"
        lines={['The details']}
        className="dv__label"
        style={{ top: textTop('mono', 34, 12, 16.3), left: fromLeft(30) }}
      />
      <Lines
        lines={DETAILS.text}
        className="dv__text"
        style={{ top: textTop('sans', DETAILS.textBaseline, 16, 20), left: fromLeft(30) }}
      />
      {DETAILS.cards.map(({ x, title, caption, image, alt }) => (
        <figure key={title} className="dv__card" style={{ left: fromCentre(x) }}>
          <div className="dv__image" style={{ top: designCss(DETAILS.cardTop) }} data-reveal="image">
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed render, sized by the card */}
            <img src={image} alt={alt} decoding="async" />
          </div>
          <figcaption>
            <Lines
              lines={[title]}
              className="dv__card-title"
              style={{ top: textTop('sans', DETAILS.cardTitleBaseline, 20, 24) }}
            />
            <Lines
              lines={[caption]}
              className="dv__card-caption"
              style={{ top: textTop('mono', DETAILS.cardCaptionBaseline, 10, 12) }}
            />
          </figcaption>
        </figure>
      ))}
    </section>
  );
}
