'use client';

import { useRef } from 'react';
import { designCss } from '@/lib/design';
import { LEFT_LINES, PILLARS, RIGHT_LINES } from './content';
import { usePillars } from './use-pillars';

const FRAME_CENTRE = 720;
// Inter's line box at line-height 1: the baseline sits 0.8638 em from its top (ascent 1984, descent 494 / 2048).
const ASCENT = 0.8638;
const WORD_SIZE = 170;

export function Pillars() {
  const root = useRef<HTMLElement>(null);
  usePillars(root);

  return (
    <section ref={root} className="pillars">
      <svg className="pillars__lines pillars__lines--left" viewBox="0 0 193 1120" aria-hidden="true">
        {LEFT_LINES.map(({ order, d }) => (
          <path key={d} d={d} data-draw={order} data-layer="faint" />
        ))}
        {LEFT_LINES.map(({ order, d }) => (
          <path key={`ink ${d}`} className="pillars__ink" d={d} data-draw={order} data-layer="ink" />
        ))}
      </svg>
      <svg className="pillars__lines pillars__lines--right" viewBox="0 0 456 1120" aria-hidden="true">
        {RIGHT_LINES.map(({ order, d }) => (
          <path key={d} d={d} data-draw={order} data-layer="faint" />
        ))}
        {RIGHT_LINES.map(({ order, d }) => (
          <path key={`ink ${d}`} className="pillars__ink" d={d} data-draw={order} data-layer="ink" />
        ))}
      </svg>

      {PILLARS.map(({ word, x, baseline, label, pill }) => (
        <div key={word} className="pillars__row">
          <h2
            className="pillars__word"
            style={{
              left: `calc(50% + ${designCss(x - FRAME_CENTRE)})`,
              top: designCss(baseline - ASCENT * WORD_SIZE),
            }}
          >
            <span className="pillars__glyphs">{word}</span>
          </h2>
          <span
            className="pillars__pill"
            style={{ left: `calc(50% + ${designCss(pill.x - FRAME_CENTRE)})`, top: designCss(pill.y) }}
          >
            {label}
          </span>
        </div>
      ))}
    </section>
  );
}
