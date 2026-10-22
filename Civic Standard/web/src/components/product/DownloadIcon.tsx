'use client';

import { useEffect, useRef } from 'react';

// Figma's file icon (Product CMS.pdf, 45 × 59), drawn as its line: a sheet whose top right corner folds down onto it.
// At rest the sheet is whole; hovering the card folds the corner over to Figma's place, leaving folds it back.
// The corner's tip slides from the sheet's corner to the fold's: while it is outside the cut, the sheet's
// edge follows it; past the cut the edge is the cut and the tip draws the folded flap.
const W = 45;
const H = 59;
const INSET = 0.675; // half the line
// the cut runs from (x, top) to (right, cut); the folded tip sits a line's width inside the cut's corner
const FOLD = { x: 27.85, y: 21.2, cut: 22 };
const TIME = 0.5;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function shapes(t: number) {
  const right = W - INSET;
  const top = INSET;
  const tip = { x: right + (FOLD.x - right) * t, y: top + (FOLD.y - top) * t };
  // outside the cut (the corner's side) the edge follows the tip; once it crosses, the edge is the cut
  const outside = (right - FOLD.x) * (tip.y - top) - (FOLD.cut - top) * (tip.x - FOLD.x) < 0;
  const edge = outside ? tip : { x: (FOLD.x + right) / 2, y: (top + FOLD.cut) / 2 };
  const sheet =
    `M${INSET} 2.7Q${INSET} ${top} 2.7 ${top}H${FOLD.x}L${edge.x} ${edge.y}L${right} ${FOLD.cut}` +
    `V56.3Q${right} ${H - INSET} 42.3 ${H - INSET}H2.7Q${INSET} ${H - INSET} ${INSET} 56.3Z`;
  const flap = `M${FOLD.x} ${top}L${tip.x} ${tip.y}L${right} ${FOLD.cut}`;
  return { sheet, flap };
}

export function DownloadIcon({ folded }: { folded: boolean }) {
  const sheet = useRef<SVGPathElement>(null);
  const flap = useRef<SVGPathElement>(null);
  const progress = useRef(0);

  useEffect(() => {
    const target = folded ? 1 : 0;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const p = progress.current;
      progress.current = target > p ? Math.min(target, p + dt / TIME) : Math.max(target, p - dt / TIME);
      const { sheet: s, flap: f } = shapes(ease(progress.current));
      sheet.current!.setAttribute('d', s);
      flap.current!.setAttribute('d', f);
      if (progress.current !== target) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [folded]);

  const rest = shapes(0);
  return (
    <svg className="spec__file" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path ref={sheet} d={rest.sheet} />
      <path ref={flap} d={rest.flap} />
      <path d="M21.9 26.1V34.6M17.95 31.05L21.9 35L25.85 31.05" />
    </svg>
  );
}
