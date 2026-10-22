'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { designPx } from '@/lib/design';
import { finishTask, reportProgress } from '@/lib/preload';
import { configure } from '@/lib/quote';
import { Roll } from '../ui/Roll';
import { CATEGORIES, FIRST, PALETTE } from './content';

type Scene = Awaited<ReturnType<typeof import('@/scene/configurator/configurator-scene').createConfiguratorScene>>;

// The navbar's bottom edge (top 25 + height 40, Figma px): the section's top past it sends the navbar up.
const NAV_CLEAR = 65;

const ALL = CATEGORIES.flatMap(({ products }) => products.map(({ id }) => id));

export function Configurator() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const measureDot = useRef<HTMLDivElement>(null);
  const layoutDot = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [category, setCategory] = useState(0);
  const [layout, setLayout] = useState(0);
  const [finishId, setFinishId] = useState(PALETTE[0].id);
  const [ready, setReady] = useState(false);

  const products = CATEGORIES[category].products;
  const product = products[layout];
  const finish = PALETTE.find(({ id }) => id === finishId)!;

  useEffect(() => {
    let cancelled = false;
    let scene: Scene | null = null;
    import('@/scene/configurator/configurator-scene')
      .then(({ createConfiguratorScene }) =>
        createConfiguratorScene(canvas.current!, canvas.current!, {
          first: FIRST,
          onProgress: (fraction) => reportProgress('configurator', fraction),
          // the dots follow the product's sides, straight on the elements: no React render per frame
          onAnchors: ({ left, right }) => {
            measureDot.current?.style.setProperty('translate', `${left.x}px ${left.y}px`);
            layoutDot.current?.style.setProperty('translate', `${right.x}px ${right.y}px`);
          },
          onDragging: (dragging) => root.current?.classList.toggle('is-dragging', dragging),
          lift: 30,
        }),
      )
      .then((created) => {
        if (cancelled) return created.dispose();
        scene = created;
        sceneRef.current = created;
        finishTask('configurator');
        setReady(true);
        // the rest of the range, one product after another, once the section is near (it waits for that itself)
        created.preload(ALL, () => !!root.current?.closest('[hidden]'));
      })
      .catch((error) => {
        console.error(error);
        finishTask('configurator');
      });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // As over BUILT OUTSIDE, the navbar slides up while the section fills the screen (it would cover the tabs), and
  // comes back once the section has gone past it, either way.
  useEffect(() => {
    const section = root.current!;
    const html = document.documentElement;
    const update = () => {
      const { top, bottom } = section.getBoundingClientRect();
      html.classList.toggle('is-nav-away', top < designPx(NAV_CLEAR) && bottom > designPx(NAV_CLEAR));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      html.classList.remove('is-nav-away');
    };
  }, []);

  useEffect(() => {
    if (ready) sceneRef.current?.show(product.id);
  }, [ready, product.id]);

  useEffect(() => {
    if (ready) sceneRef.current?.setColour(finish.hex);
  }, [ready, finish.hex]);

  return (
    <section ref={root} className={`cf${ready ? ' is-ready' : ''}`}>
      <canvas ref={canvas} className="cf__canvas" />

      <div className="cf__tabs" role="tablist">
        {CATEGORIES.map(({ name }, i) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={i === category}
            className="cf__tab"
            onClick={() => {
              setCategory(i);
              setLayout(0);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <span className="cf__rule cf__rule--top" />
      <p className="cf__name">{product.name}</p>

      <div ref={measureDot} className="cf__dot" aria-label={`${product.measure[0]} ${product.measure[1]}`}>
        {/* the icons as Figma draws them (Customize - Section.pdf), in the 48 px circle */}
        <span className="cf__circle">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M20.50 17.05L21.34 17.92L25.90 13.32L25.90 26.00L27.10 26.00L27.10 13.32L31.65 17.91L32.50 17.05C30.30 14.84 28.60 13.12 26.50 11.00L20.50 17.05Z" />
            <path
              d="M26.50 30.95L25.66 30.08L21.10 34.68L21.10 22.00L19.90 22.00L19.90 34.68L15.35 30.09L14.50 30.95C16.70 33.16 18.40 34.88 20.50 37.00L26.50 30.95Z"
              opacity="0.3"
            />
          </svg>
        </span>
        <span className="cf__label">
          {product.measure[0]} {product.measure[1]}
        </span>
      </div>

      <div ref={layoutDot} className="cf__dot cf__dot--button">
        <button
          type="button"
          className="cf__circle"
          aria-label={`Layout ${layout + 1} of ${products.length}: show the next`}
          onClick={() => setLayout((layout + 1) % products.length)}
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M14.60 22.36L13.54 24.47C13.41 18.83 17.87 14.16 23.51 14.03C25.66 13.98 27.77 14.61 29.54 15.83L30.59 14.30C25.11 10.52 17.60 11.90 13.81 17.38C12.24 19.65 11.50 22.39 11.71 25.15L9.51 24.04L8.68 25.70L13.72 28.24L16.26 23.19L14.60 22.36Z" />
            <path d="M33.76 20.23L31.22 25.28L32.88 26.11L33.95 23.97C34.10 29.62 29.64 34.31 24.00 34.45C21.76 34.51 19.56 33.83 17.74 32.51L16.65 34.01C19.23 35.90 22.47 36.68 25.63 36.17C26.28 36.07 26.92 35.91 27.54 35.71C32.81 33.96 36.20 28.85 35.77 23.33L37.96 24.43L38.80 22.77L33.76 20.23Z" />
          </svg>
        </button>
        <span className="cf__label">Layout {layout + 1}</span>
      </div>

      <span className="cf__rule cf__rule--bottom" />
      <p className="cf__finish">
        {finish.name} <span>{finish.note}</span>
      </p>
      <div className="cf__swatches" role="radiogroup" aria-label="Frame colour">
        {PALETTE.map(({ id, name, hex }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === finish.id}
            aria-label={name}
            className="cf__swatch"
            style={{ '--swatch': hex } as CSSProperties}
            onClick={() => setFinishId(id)}
          />
        ))}
      </div>
      <div className="cf__actions">
        <button
          type="button"
          className="pill cf__configure"
          onClick={() => configure({ id: product.id, finish: finish.id })}
        >
          <Roll text="Configure yours" />
        </button>
        <button
          type="button"
          className="pill pill--icon cf__arrow"
          aria-label="Configure yours"
          onClick={() => configure({ id: product.id, finish: finish.id })}
        >
          <svg viewBox="0 0 12 11.2" aria-hidden="true">
            <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
          </svg>
        </button>
      </div>
    </section>
  );
}
