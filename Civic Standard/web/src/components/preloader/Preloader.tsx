'use client';

import { useEffect, useRef } from 'react';
import { markLoaded } from '@/lib/intro';
import { LOGO_PARTS, LOGO_VIEWBOX } from '@/lib/logo-outline';
import { preloadProgress } from '@/lib/preload';

// Mask in viewBox units, like a loading spinner: a disc half the logo's size runs around its edges at a steady pace and,
// as the page loads, grows to the whole logo while its path closes in on the centre.
const CENTER = { x: LOGO_VIEWBOX.width / 2, y: LOGO_VIEWBOX.height / 2 };
const ORBIT_START = 95;
const RADIUS_START = 58;
const RADIUS_FULL = 132;
const TURN_S = 1.3;
// The disc opens from nothing instead of popping in at half the logo's size.
const APPEAR_S = 0.9;

const TRACE_MS = 1800;
const MIN_FILL_S = 2.6;
const HOLD_MS = 250;

export function Preloader() {
  const circle = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const start = performance.now();
    let last = start;
    let shown = 0;
    let fullAt = 0;
    let frame = 0;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (now - start > TRACE_MS) {
        shown = Math.min(preloadProgress(), shown + dt / MIN_FILL_S);
        const spinning = (now - start - TRACE_MS) / 1000;
        const angle = (spinning / TURN_S) * Math.PI * 2 - Math.PI / 2;
        const appear = 1 - (1 - Math.min(spinning / APPEAR_S, 1)) ** 3;
        const grown = shown * shown * (3 - 2 * shown);
        const orbit = ORBIT_START * (1 - grown);
        const el = circle.current;
        if (el) {
          el.setAttribute('cx', (CENTER.x + Math.cos(angle) * orbit).toFixed(2));
          el.setAttribute('cy', (CENTER.y + Math.sin(angle) * orbit).toFixed(2));
          el.setAttribute('r', (appear * RADIUS_START + grown * (RADIUS_FULL - RADIUS_START)).toFixed(2));
        }
        if (shown >= 1) fullAt ||= now;
        if (fullAt && now - fullAt > HOLD_MS) {
          markLoaded();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="preloader" aria-hidden="true">
      <svg className="preloader__logo" viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}>
        <defs>
          <clipPath id="preloader-mask">
            <circle ref={circle} cx={CENTER.x} cy={CENTER.y} r={0} />
          </clipPath>
        </defs>
        <g className="preloader__trace">
          {LOGO_PARTS.map((d, i) => (
            <path key={i} d={d} pathLength={1} style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </g>
        <g className="preloader__fill" clipPath="url(#preloader-mask)">
          {LOGO_PARTS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </div>
  );
}
