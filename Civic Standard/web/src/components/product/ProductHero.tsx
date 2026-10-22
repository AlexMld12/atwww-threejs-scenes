'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { designCss, designPx } from '@/lib/design';
import { addToQuote, configure, openQuote } from '@/lib/quote';
import { navigate, onEnter } from '@/lib/routes';
import { fromCentre, textTop } from '../details/place';
import { FINISHES, firstFinish, HERO, sizes, type Page } from './content';
import { holdForHero } from './settle';

// Figma's icons (Product CMS.pdf, the hero's two cards)
const CONFIGURE_ICON =
  'M14.11 4.69C14.39 4.56 14.69 4.49 14.99 4.48C15.29 4.48 15.60 4.54 15.87 4.67C16.41 4.91 16.90 5.26 17.32 5.68L17.92 6.27C18.34 6.69 18.68 7.18 18.93 7.73L18.93 7.73C19.05 8.00 19.12 8.30 19.11 8.61C19.11 8.91 19.04 9.21 18.90 9.49L18.82 9.66C18.58 10.15 18.26 10.60 17.87 10.99L11.59 17.21C11.37 17.42 11.08 17.54 10.78 17.54L9.40 17.54C8.85 17.54 8.31 17.45 7.79 17.27L7.60 17.20C7.32 17.10 7.05 16.94 6.84 16.73C6.62 16.52 6.45 16.26 6.34 15.97C6.13 15.42 6.03 14.83 6.02 14.23L6.06 13.33L6.06 12.81C6.06 12.50 6.18 12.21 6.39 11.99L12.61 5.72C12.99 5.33 13.45 5.01 13.94 4.77L14.11 4.68L14.11 4.69M7.95 12.69C7.87 12.77 7.80 12.87 7.76 12.98C7.71 13.09 7.69 13.21 7.69 13.33L7.73 13.84C7.73 14.24 7.71 14.65 7.68 15.05L7.61 15.70C7.61 15.74 7.61 15.79 7.63 15.83C7.64 15.87 7.67 15.90 7.70 15.93C7.73 15.96 7.76 15.99 7.80 16.00C7.84 16.02 7.89 16.02 7.93 16.02L8.74 15.95C9.09 15.92 9.44 15.91 9.79 15.91L10.27 15.91C10.39 15.91 10.51 15.89 10.62 15.84C10.73 15.80 10.82 15.73 10.91 15.65L15.53 11.03L12.57 8.07L7.95 12.69L7.95 12.69M3.10 7.28L3.10 8.72L4.54 8.72L4.54 10.37L3.10 10.37L3.10 11.81L1.44 11.81L1.44 10.37L0.00 10.37L0.00 8.72L1.44 8.72L1.44 7.28L3.10 7.28M15.17 5.78C15.15 5.75 15.11 5.72 15.07 5.70C15.03 5.69 14.99 5.68 14.95 5.68C14.91 5.68 14.86 5.68 14.82 5.70C14.78 5.72 14.75 5.75 14.72 5.78L14.20 6.39C14.05 6.56 13.90 6.73 13.74 6.89L16.71 9.86C16.88 9.70 17.04 9.55 17.21 9.40L17.83 8.88C17.87 8.85 17.89 8.82 17.91 8.78C17.93 8.74 17.94 8.70 17.94 8.65C17.94 8.61 17.93 8.57 17.91 8.53C17.89 8.49 17.86 8.46 17.83 8.43L17.33 8.02C17.07 7.80 16.83 7.59 16.59 7.36L16.59 7.36L16.23 7.00L16.23 7.00C16.00 6.76 15.79 6.52 15.58 6.26L15.16 5.76L15.17 5.78M7.90 2.31L10.20 2.31L10.20 3.97L7.90 3.97L7.90 6.26L6.25 6.26L6.25 3.95L3.94 3.95L3.94 2.29L6.24 2.29L6.24 0.00L7.89 0.00L7.89 2.29L7.90 2.31Z';
const CART_ICON =
  'M17.56 4.21L16.40 7.68C16.21 8.17 16.14 8.70 16.18 9.22C16.18 9.27 16.18 9.33 16.16 9.38C16.14 9.43 16.11 9.48 16.07 9.51C16.03 9.55 15.98 9.58 15.93 9.60C15.88 9.62 15.82 9.62 15.77 9.62L15.14 9.56C14.70 9.52 14.27 9.50 13.83 9.50L5.52 9.50C5.08 9.50 4.64 9.52 4.21 9.56L3.58 9.61C3.52 9.62 3.47 9.61 3.41 9.59C3.36 9.57 3.31 9.54 3.27 9.50C3.24 9.46 3.21 9.42 3.19 9.36C3.17 9.31 3.16 9.26 3.17 9.20C3.21 8.68 3.14 8.15 2.95 7.66L1.77 4.21L-0.00 4.21L1.49 8.61L1.80 9.50C2.05 10.23 2.61 10.81 3.33 11.08C3.83 11.27 4.36 11.37 4.90 11.37L14.40 11.37C14.93 11.37 15.46 11.27 15.97 11.08C16.32 10.95 16.64 10.73 16.91 10.46C17.17 10.19 17.37 9.86 17.50 9.50L17.80 8.61L19.33 4.21L17.56 4.21M7.69 15.62C7.78 15.40 7.83 15.17 7.83 14.93C7.83 14.69 7.78 14.46 7.69 14.24C7.60 14.02 7.46 13.82 7.30 13.66C7.13 13.49 6.93 13.36 6.71 13.26C6.49 13.17 6.26 13.13 6.02 13.13C5.79 13.13 5.55 13.17 5.33 13.26C5.11 13.35 4.92 13.49 4.75 13.65C4.58 13.82 4.45 14.02 4.36 14.24C4.17 14.68 4.17 15.18 4.36 15.62C4.54 16.06 4.89 16.41 5.33 16.59C5.77 16.78 6.27 16.78 6.71 16.59C7.15 16.41 7.50 16.06 7.69 15.62M13.59 16.71C13.82 16.67 14.05 16.59 14.25 16.46C14.45 16.34 14.62 16.18 14.76 15.98C14.90 15.79 15.00 15.57 15.05 15.34C15.11 15.11 15.12 14.87 15.08 14.64C15.04 14.41 14.96 14.18 14.83 13.98C14.71 13.78 14.54 13.60 14.35 13.47C14.16 13.33 13.94 13.23 13.71 13.17C13.48 13.12 13.24 13.11 13.01 13.15C12.54 13.23 12.11 13.49 11.84 13.88C11.56 14.26 11.44 14.75 11.52 15.22C11.60 15.69 11.86 16.11 12.24 16.39C12.63 16.67 13.12 16.79 13.59 16.71ZM8.76 7.16L10.55 7.16L10.55 4.48L13.23 4.48L13.23 2.68L10.56 2.68L10.56 0.00L8.77 0.00L8.77 2.68L6.09 2.68L6.09 4.48L8.77 4.48L8.77 7.16L8.76 7.16Z';

// the hero's entrance (plaza-scene.ts: 2.8 s, expo out) has mostly played after 1.5 s
const HOLD_AFTER_ENTER = 1500;
const HOLD_MAX = 6000;

// the band over a silhouette: across the plaza at the product's middle; two equal halves, each the band's width,
// so moving by one half loops
const SOON_TOP = 420;
const SOON_REPEAT = 7;

type Scene = Awaited<ReturnType<typeof import('@/scene/plaza/plaza-scene').createPlazaScene>>;

// Motion (ours, on Figma's layout): the plaza fades in as the camera eases back to its pose (plaza-scene.ts); the
// title rises in its mask, the bar's groups follow from below, 0.08 s apart; the rule draws from the left.
// The navbar's mark is light over the plaza and turns green once the plaza has passed under it.
export function ProductHero({ page }: { page: Page }) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);
  const [modelled, setModelled] = useState(true);
  const [finish, setFinish] = useState(() => firstFinish(page));
  const colour = FINISHES.find((f) => f.id === finish)!.hex;

  // the parts below wait for the hero (settle.ts): released once its entrance has mostly played, or at the latest
  // after HOLD_MAX (no 3D), or as it goes
  const release = useRef<() => void>(() => undefined);
  useEffect(() => {
    release.current = holdForHero();
    const latest = window.setTimeout(release.current, HOLD_MAX);
    return () => {
      window.clearTimeout(latest);
      release.current();
    };
  }, []);

  useEffect(() => onEnter((view) => view === 'product' && setEntered(true)), []);

  useEffect(() => {
    let cancelled = false;
    import('@/scene/plaza/plaza-scene')
      .then(({ createPlazaScene }) =>
        createPlazaScene(canvas.current!, {
          product: page.id,
          dimensions: page.dimensions,
          colour,
          onProgress: () => undefined,
        }),
      )
      .then((created) => {
        // dropped before use (a remount): the canvas and its context stay for the next scene
        if (cancelled) return created.dispose(false);
        scene.current = created;
        setModelled(created.hasModel);
        setReady(true);
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
    // the scene is built once per page; the colour changes go through setColour
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  useEffect(() => scene.current?.setColour(colour), [colour]);
  const shown = entered && ready;
  useEffect(() => {
    if (!shown) return;
    scene.current?.enter();
    const timer = window.setTimeout(() => release.current(), HOLD_AFTER_ENTER);
    return () => window.clearTimeout(timer);
  }, [shown]);

  // the navbar's light mark while the plaza is under it (once it is there)
  useEffect(() => {
    const html = document.documentElement;
    const update = () => {
      const bottom = root.current?.getBoundingClientRect().top ?? 0;
      html.classList.toggle('is-nav-light', shown && bottom + designPx(HERO.stage) > designPx(45));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      html.classList.remove('is-nav-light');
    };
  }, [shown]);

  const finishName = FINISHES.find((f) => f.id === finish)!.name;

  return (
    <section ref={root} className={`ph${entered ? ' is-entered' : ''}${shown ? ' is-shown' : ''}`}>
      <div className="ph__stage">
        <canvas ref={canvas} className="ph__canvas" />
      </div>
      {modelled ? (
        <button
          type="button"
          className="ph__next"
          aria-label="Turn the product"
          style={{ left: fromCentre(HERO.next.x), top: designCss(HERO.next.y) }}
          onClick={() => scene.current?.next()}
        >
          <svg viewBox="0 0 15 12" aria-hidden="true">
            <path d="M8.95 0 8.08.84l4.6 4.56H0v1.2h12.68l-4.59 4.55.86.85C11.16 9.8 12.88 8.1 15 6z" />
          </svg>
        </button>
      ) : (
        // no 3D model yet: the silhouette stands in the plaza under a band
        <div className="ph__soon" aria-label="Coming soon" style={{ top: designCss(SOON_TOP) }}>
          <div className="ph__soon-run" aria-hidden="true">
            {[0, 1].map((half) => (
              <div key={half} className="ph__soon-half">
                {Array.from({ length: SOON_REPEAT }, (_, k) => (
                  <span key={k}>Coming soon</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <h1 className="ph__title ph__mask" style={{ top: textTop('sans', HERO.titleBaseline, 40, 48) }}>
        <span className="ph__mask-inner">{page.name}</span>
      </h1>

      <div className="ph__group" style={{ '--i': 0 } as CSSProperties}>
        <p
          className="ph__label"
          style={{ left: designCss(HERO.finishX), top: textTop('sans', HERO.labelBaseline, 16, 20) }}
        >
          {finishName}
        </p>
        <div
          className="ph__swatches"
          role="radiogroup"
          aria-label="Finish"
          style={{ left: designCss(HERO.finishX), top: designCss(HERO.swatchesTop) }}
        >
          {FINISHES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === finish}
              aria-label={f.name}
              className={`ph__swatch${f.id === finish ? ' is-on' : ''}${f.id === 'warm_white' ? ' is-light' : ''}`}
              style={{ '--swatch': f.hex } as CSSProperties}
              onClick={() => setFinish(f.id)}
            />
          ))}
        </div>
      </div>

      <div className="ph__group" style={{ '--i': 1 } as CSSProperties}>
        <p
          className="ph__label"
          style={{ left: designCss(HERO.configurationX), top: textTop('sans', HERO.labelBaseline, 16, 20) }}
        >
          Configuration
        </p>
        <div className="ph__sizes" style={{ left: designCss(HERO.configurationX), top: designCss(HERO.sizesTop) }}>
          {sizes(page).map((size) => (
            <button
              key={size.id}
              type="button"
              className={`ph__size${size.current ? ' is-on' : ''}`}
              aria-pressed={size.current}
              onClick={() => !size.current && size.slug && navigate('product', size.slug)}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ph__group ph__cards" style={{ '--i': 2, top: designCss(HERO.cardsTop) } as CSSProperties}>
        <button
          type="button"
          className="ph__card ph__card--configure"
          onClick={() => configure({ id: page.id, finish })}
        >
          <span className="ph__card-title">Configure</span>
          <span className="ph__card-note">Civic Studio™</span>
          <span className="ph__card-icon" aria-hidden="true">
            <svg viewBox="0 0 19.12 17.54">
              <path d={CONFIGURE_ICON} />
            </svg>
          </span>
        </button>
        <button
          type="button"
          className="ph__card ph__card--quote"
          onClick={() => {
            addToQuote(page.id, finish);
            openQuote();
          }}
        >
          <span className="ph__card-title">Add to quote</span>
          <span className="ph__card-note">Price on request</span>
          <span className="ph__card-icon" aria-hidden="true">
            <svg viewBox="0 0 19.33 16.79">
              <path d={CART_ICON} />
            </svg>
          </span>
        </button>
      </div>

      <span className="ph__rule" style={{ top: designCss(HERO.rule) }} />
    </section>
  );
}
