import type { ElementType } from 'react';
import type { CSSVars } from '@/lib/css';
import { Reveal } from './Reveal';

interface Row {
  className: string;
  delay: number;
  text: string;
  /** Left margin of each letter in em, measured from the Figma PDF by tools/mega_spacing.py. */
  margins: number[];
  blurredEnds?: boolean;
}

const ROWS: Row[] = [
  {
    className: 'mega-cond mega-cond--1',
    delay: 0,
    text: 'BEYOND',
    margins: [1.1625, -0.0208, -0.0009, -0.0764, -0.0506, -0.0515],
  },
  {
    className: 'mega-exp',
    delay: 0.07,
    text: 'ALWAYS',
    margins: [0, -0.0552, -0.1122, -0.1516, -0.2216, -0.1034],
    blurredEnds: true,
  },
  {
    className: 'mega-cond mega-cond--3',
    delay: 0.14,
    text: 'STATEOFMIND',
    margins: [0.1678, -0.0313, -0.094, -0.0949, -0.031, 0.0169, -0.0514, -0.0076, -0.0512, -0.0508, -0.0515],
  },
];

/** BEYOND / ALWAYS / STATE OF MIND, placed letter by letter as in Figma. */
export function Mega({ as: Tag = 'p', className }: { as?: ElementType; className: string }) {
  return (
    <Tag className={className} aria-label="Beyond always state of mind">
      {ROWS.map((row) => (
        <Reveal key={row.text} as="span" className={row.className} delay={row.delay} fx="blur" aria-hidden>
          {[...row.text].map((glyph, i) => {
            const letter = (
              <i key={i} style={{ '--m': `${row.margins[i]}em` } as CSSVars}>
                {glyph}
              </i>
            );
            const isEnd = i === 0 || i === row.text.length - 1;
            return row.blurredEnds && isEnd ? (
              <span key={i} className="blur">
                {letter}
              </span>
            ) : (
              letter
            );
          })}
        </Reveal>
      ))}
    </Tag>
  );
}
