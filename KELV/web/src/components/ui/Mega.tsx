import type { ElementType } from 'react';
import type { CSSVars } from '@/lib/css';
import { Reveal } from './Reveal';

type Letter = [glyph: string, margin: number];

/**
 * BEYOND / ALWAYS / STATE OF MIND, letter by letter: each margin (em) places the glyph
 * where it sits in the Figma PDF (tools/mega_spacing.py). A single letter-spacing cannot
 * reproduce those gaps, and Chrome's kerning made pairs like E-Y touch.
 */
const ROWS: { className: string; delay: number; letters: Letter[]; blurredEnds?: boolean }[] = [
  {
    className: 'mega-cond mega-cond--1',
    delay: 0,
    letters: [['B', 1.1625], ['E', -0.0208], ['Y', -0.0009], ['O', -0.0764], ['N', -0.0506], ['D', -0.0515]],
  },
  {
    className: 'mega-exp',
    delay: 0.07,
    blurredEnds: true,
    letters: [['A', 0], ['L', -0.0552], ['W', -0.1122], ['A', -0.1516], ['Y', -0.2216], ['S', -0.1034]],
  },
  {
    className: 'mega-cond mega-cond--3',
    delay: 0.14,
    letters: [
      ['S', 0.1678], ['T', -0.0313], ['A', -0.094], ['T', -0.0949], ['E', -0.031], ['O', 0.0169],
      ['F', -0.0514], ['M', -0.0076], ['I', -0.0512], ['N', -0.0508], ['D', -0.0515],
    ],
  },
];

export function Mega({ as: Tag = 'p', className }: { as?: ElementType; className: string }) {
  return (
    <Tag className={className} aria-label="Beyond always state of mind">
      {ROWS.map((row, r) => (
        <Reveal key={r} as="span" className={row.className} delay={row.delay} fx="blur" aria-hidden>
          {row.letters.map(([glyph, margin], i) => {
            const letter = (
              <i key={i} style={{ '--m': `${margin}em` } as CSSVars}>
                {glyph}
              </i>
            );
            const isEnd = i === 0 || i === row.letters.length - 1;
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
