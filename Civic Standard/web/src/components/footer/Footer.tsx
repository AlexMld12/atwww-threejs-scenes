'use client';

import { useRef } from 'react';
import { fromLeft } from '../details/place';
import { Prefooter } from '../prefooter/Prefooter';
import { useFooter } from './use-footer';

// Figma: Civic Standard.pdf 11726.7–11907.7; the wordmark as drawn (tools/extract_drawings.py), the bottom row from
// the band's foot (its baseline 10 px above it).
const POLICIES = [
  { label: 'Quote policy', x: 525 },
  { label: 'Delivery policy', x: 916 },
  { label: 'Terms of use', x: null },
];

export function Footer() {
  const root = useRef<HTMLElement>(null);
  useFooter(root);

  return (
    <footer ref={root} className="ft">
      <Prefooter />
      <div className="ft__band">
        <div className="ft__inner">
          {/* eslint-disable-next-line @next/next/no-img-element -- the wordmark as Figma draws it */}
          <img className="ft__wordmark" src="/footer/wordmark.svg" alt="Civic Standard" />
          <p className="ft__copyright">Civic Standard 2026, all rights reserved</p>
          {POLICIES.map(({ label, x }) => (
            <button
              key={label}
              type="button"
              className={`pf__link ft__policy${x === null ? ' ft__policy--last' : ''}`}
              style={{ left: x === null ? undefined : fromLeft(x) }}
            >
              <span className="pf__label">{label}</span>
            </button>
          ))}
        </div>
        <span className="ft__veil" />
      </div>
    </footer>
  );
}
