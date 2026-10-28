'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { navigate, onEnter } from '@/lib/routes';
import { Lines } from '../details/Lines';
import { Roll } from '../ui/Roll';
import { BUTTONS, FOUR, FOURS, LABELS, TEXT, ZERO } from './content';
import { useHover } from './use-hover';

type Scene = Awaited<ReturnType<typeof import('@/scene/notfound/bin-scene').createBinScene>>;

// Figma's arrow (Product CMS.pdf), as the navbar's Back
const BACK_ICON = 'M5.26 10.45 6.02 9.72 2.03 5.72h9.35V4.68H2.03L6.01.7 5.26-.05C3.34 1.87 1.86 3.36.02 5.2z';
// the station lands once the fours have started to come up
const LAND_DELAY_MS = 350;
// Its loading (shaders, textures, what it reflects) holds the main thread for 60–120 ms at a time: the entrance waits
// for it, drawn and settled, so nothing stutters; past this it plays anyway (a slow network, no WebGL).
const READY_WAIT_MS = 3000;
const SETTLE_FRAMES = 3;

const place = (desktop: readonly number[], phone: readonly number[]) =>
  ({ '--x': desktop[0], '--y': desktop[1], '--px': phone[0], '--py': phone[1] }) as CSSProperties;

/**
 * The 404: the station stands for the 0 between the two 4s, the words around it hover as a craft looking for its
 * balance. Entrance, with the site's pieces: the 4s are uncovered from the bottom while they rise, the station comes
 * down onto its shadow, the sentence's lines rise in their masks, the buttons and the words follow.
 */
export function NotFound() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const zero = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);
  const shown = entered && ready;
  useHover(root);

  useEffect(() => onEnter((view) => view === 'notfound' && setEntered(true)), []);

  useEffect(() => {
    let alive = true;
    import('@/scene/notfound/bin-scene')
      .then(({ createBinScene }) => createBinScene(canvas.current!, zero.current!))
      .then((created) => {
        if (!alive) return created.dispose();
        scene.current = created;
        // its first frame drawn (the buffers' upload) before the entrance starts
        let frames = SETTLE_FRAMES;
        const settle = () => (--frames > 0 ? requestAnimationFrame(settle) : alive && setReady(true));
        requestAnimationFrame(settle);
      })
      .catch((error) => {
        console.error(error);
        if (alive) setReady(true);
      });
    const fallback = window.setTimeout(() => setReady(true), READY_WAIT_MS);
    return () => {
      alive = false;
      window.clearTimeout(fallback);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  // it lands after the entrance has begun, or as soon as it has loaded if that is later
  useEffect(() => {
    if (!shown) return;
    let timer = 0;
    const start = performance.now();
    const wait = () => {
      if (!scene.current) return void (timer = window.setTimeout(wait, 50));
      const late = performance.now() - start;
      timer = window.setTimeout(() => scene.current!.land(), Math.max(0, LAND_DELAY_MS - late));
    };
    wait();
    return () => window.clearTimeout(timer);
  }, [shown]);

  const home = () => navigate('home');

  return (
    <section ref={root} className={`nf${shown ? ' is-in' : ''}`}>
      <div className="nf__frame">
        {FOURS.map(({ desktop, phone }, i) => (
          <svg
            key={i}
            className="nf__at nf__four"
            viewBox={FOUR.viewBox}
            style={{ ...place(desktop, phone), '--i': i } as CSSProperties}
            aria-hidden="true"
          >
            <path d={FOUR.path} />
          </svg>
        ))}
        <div ref={zero} className="nf__at nf__zero" style={place(ZERO.desktop, ZERO.phone)} />
      </div>

      <canvas ref={canvas} className="nf__canvas" aria-hidden="true" />

      <div className="nf__frame">
        <h1 className="nf__title">404, page not found</h1>
        {LABELS.map(({ text, desktop, phone, landscape }, i) => (
          <span
            key={text}
            className="nf__at nf__label"
            style={
              {
                ...place(desktop, phone),
                '--i': i,
                ...(landscape && { '--lx': landscape[0], '--ly': landscape[1] }),
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <span className="nf__label-inner">{text}</span>
          </span>
        ))}
        <Lines
          lines={TEXT.lines}
          className="nf__text"
          style={{ '--y': TEXT.desktop, '--py': TEXT.phone } as CSSProperties}
        />
        <div className="nf__actions" style={{ '--y': BUTTONS.desktop, '--py': BUTTONS.phone } as CSSProperties}>
          <div className="nf__buttons">
            <button type="button" className="pill pill--icon nf__arrow" aria-label="Back to homepage" onClick={home}>
              <svg viewBox="0 -0.05 11.4 10.5" aria-hidden="true">
                <path d={BACK_ICON} />
              </svg>
            </button>
            <button type="button" className="pill nf__home" aria-label="Back to homepage" onClick={home}>
              <Roll text="Back to homepage" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
