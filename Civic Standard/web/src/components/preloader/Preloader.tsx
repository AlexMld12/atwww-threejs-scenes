'use client';

import { useEffect, useRef } from 'react';
import { loaderMask, markLoaded, onHandover } from '@/lib/intro';
import { LOGO_PARTS, LOGO_VIEWBOX } from '@/lib/logo-outline';
import { isFinished, preloadProgress } from '@/lib/preload';

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
// Under the disc the glass grows with it (depth and opacity) and is whole exactly when the disc has uncovered all the
// lines; if the scene compiles late it catches up at most this fast, so it never pops in.
const GLASS_CATCH_UP_S = 0.4;
// Once the whole logo is lines and glass, the lines go.
const LINES_OUT_S = 0.7;

export function Preloader() {
  const svg = useRef<SVGSVGElement>(null);
  const circle = useRef<SVGCircleElement>(null);
  const lines = useRef<SVGGElement>(null);

  useEffect(() => {
    // the navbar waits for the scene, also when it was already in (the home opened after another page)
    document.documentElement.classList.add('is-preloading');
    const stopHandover = onHandover(() => document.documentElement.classList.remove('is-preloading'));
    const start = performance.now();
    let last = start;
    let shown = 0;
    let glass = 0;
    let linesOut = 0;
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
        const x = CENTER.x + Math.cos(angle) * orbit;
        const y = CENTER.y + Math.sin(angle) * orbit;
        const r = appear * RADIUS_START + grown * (RADIUS_FULL - RADIUS_START);
        circle.current?.setAttribute('cx', x.toFixed(2));
        circle.current?.setAttribute('cy', y.toFixed(2));
        circle.current?.setAttribute('r', r.toFixed(2));

        const glassTarget = isFinished('compile') ? grown : 0;
        glass = glassTarget > glass ? Math.min(glassTarget, glass + dt / GLASS_CATCH_UP_S) : glassTarget;
        const ctm = svg.current?.getScreenCTM();
        if (ctm) Object.assign(loaderMask, { x: ctm.a * x + ctm.e, y: ctm.d * y + ctm.f, radius: ctm.a * r });
        loaderMask.glass = glass;

        if (shown >= 1 && glass >= 1) linesOut = Math.min(1, linesOut + dt / LINES_OUT_S);
        if (lines.current) lines.current.style.opacity = String(1 - linesOut * linesOut * (3 - 2 * linesOut));
        if (linesOut >= 1) fullAt ||= now;
        if (fullAt && now - fullAt > HOLD_MS) {
          markLoaded();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stopHandover();
    };
  }, []);

  return (
    <div className="preloader" aria-hidden="true">
      <svg ref={svg} className="preloader__logo" viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}>
        <defs>
          <clipPath id="preloader-mask">
            <circle ref={circle} cx={CENTER.x} cy={CENTER.y} r={0} />
          </clipPath>
        </defs>
        <g ref={lines}>
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
        </g>
      </svg>
    </div>
  );
}
