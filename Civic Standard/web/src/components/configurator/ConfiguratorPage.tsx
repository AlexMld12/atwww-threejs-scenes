'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { designCss } from '@/lib/design';
import { addToQuote, openQuote, takePick, updateQuote } from '@/lib/quote';
import { currentSlug } from '@/lib/routes';
import { firstFinish, sizes } from '../product/content';
import catalogue from '../product/catalogue.json';
import { finishById, locate, measureOf, PAGE_CATEGORIES, PALETTE } from './content';
import plans from './plans.json';

type Scene = Awaited<ReturnType<typeof import('@/scene/configurator/configurator-scene').createConfiguratorScene>>;

// Configurator.pdf: the plan's three views (tools/blender_profiles.py --plan) as Figma lays out the bench's: the
// front on the line 716.1, the top view 19 px above it, the right end 31.4 px right of it, at 0.1044 px a mm at most.
const PLAN = { scale: 208.8 / 2000, gap: [31.4, 19], box: [301.3, 156.5], left: 29.9, foot: 716.1 };

function Plan({ id }: { id: string }) {
  const plan = (plans as Record<string, { mm: number[]; margin: number }>)[id];
  if (!plan) return null;
  const [length, depth, height] = plan.mm;
  const scale = Math.min(
    PLAN.scale,
    (PLAN.box[0] - PLAN.gap[0]) / (length + depth),
    (PLAN.box[1] - PLAN.gap[1]) / (depth + height),
  );
  const m = plan.margin * scale;
  // each view's box (Figma px): left, the distance of its foot above the plan's foot, width, height
  const views = [
    ['top', 0, height * scale + PLAN.gap[1], length * scale, depth * scale],
    ['front', 0, 0, length * scale, height * scale],
    ['side', length * scale + PLAN.gap[0], 0, depth * scale, height * scale],
  ] as const;
  return (
    <div className="cfp__plan" style={{ left: designCss(PLAN.left), bottom: designCss(850 - PLAN.foot) }}>
      {views.map(([view, x, y, w, h]) => (
        // eslint-disable-next-line @next/next/no-img-element -- line drawings, sized from their millimetres
        <img
          key={view}
          className="cfp__view"
          src={`/profiles/${id}-plan-${view}.webp`}
          alt=""
          style={{
            left: designCss(x - m),
            bottom: designCss(y - m),
            width: designCss(w + 2 * m),
            height: designCss(h + 2 * m),
          }}
        />
      ))}
    </div>
  );
}

// The configurator's own page (Configurator.pdf, 1440 × 850): the home's section (Configurator.tsx, the same scene)
// as a page of its own, with the plan, the model's sizes and the pick to the quote.
// It opens on the product it was asked for (its page, the home's section, EDIT CONFIGURATION).
export function ConfiguratorPage() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const measureDot = useRef<HTMLDivElement>(null);
  const layoutDot = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [start] = useState(() => takePick(currentSlug()));
  const [productId, setProductId] = useState(start.id);
  const page = catalogue.find((p) => p.id === productId)!;
  // as the product's page starts it (a galvanised frame on sage)
  const [finishId, setFinishId] = useState(
    () => start.finish ?? firstFinish(catalogue.find((p) => p.id === start.id)!),
  );
  const [editing, setEditing] = useState(start.edit);
  const [ready, setReady] = useState(false);

  const { category, layout } = locate(productId);
  const products = PAGE_CATEGORIES[category].products;
  const model = products[layout];
  const measure = measureOf(productId, model);
  const finish = finishById(finishId);

  useEffect(() => {
    let cancelled = false;
    let scene: Scene | null = null;
    import('@/scene/configurator/configurator-scene')
      .then(({ createConfiguratorScene }) =>
        createConfiguratorScene(canvas.current!, canvas.current!, {
          first: [start.id],
          onProgress: () => undefined,
          onAnchors: ({ left, right }) => {
            measureDot.current?.style.setProperty('translate', `${left.x}px ${left.y}px`);
            layoutDot.current?.style.setProperty('translate', `${right.x}px ${right.y}px`);
          },
          onDragging: (dragging) => root.current?.classList.toggle('is-dragging', dragging),
          band: { top: 135, bottom: 275 },
        }),
      )
      .then((created) => {
        if (cancelled) return created.dispose();
        scene = created;
        sceneRef.current = created;
        setReady(true);
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [start.id]);

  useEffect(() => {
    if (ready) void sceneRef.current?.show(productId);
  }, [ready, productId]);

  useEffect(() => {
    if (ready) sceneRef.current?.setColour(finish.hex);
  }, [ready, finish.hex]);

  const pickModel = (next: number) => setProductId(products[(next + products.length) % products.length].id);

  const select = () => {
    if (editing) updateQuote(editing, productId, finish.id);
    else addToQuote(productId, finish.id);
    setEditing(undefined);
    openQuote();
  };

  return (
    <section
      ref={root}
      className={`cf cfp${ready ? ' is-ready' : ''}`}
      style={{ '--swatch': finish.hex } as CSSProperties}
    >
      <canvas ref={canvas} className="cf__canvas" />

      <div className="cf__tabs" role="tablist">
        {PAGE_CATEGORIES.map(({ name, products: list }, i) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={i === category}
            className="cf__tab"
            onClick={() => i !== category && setProductId(list[0].id)}
          >
            {name}
          </button>
        ))}
      </div>
      <span className="cf__rule cf__rule--top" />
      <p className="cf__name">{page.name}</p>

      <div ref={measureDot} className="cf__dot" aria-label={`${measure[0]} ${measure[1]}`}>
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
          {measure[0]} {measure[1]}
        </span>
      </div>

      <div ref={layoutDot} className="cf__dot cf__dot--button">
        <button
          type="button"
          className="cf__circle"
          aria-label={`Layout ${layout + 1} of ${products.length}: show the next`}
          onClick={() => pickModel(layout + 1)}
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M14.60 22.36L13.54 24.47C13.41 18.83 17.87 14.16 23.51 14.03C25.66 13.98 27.77 14.61 29.54 15.83L30.59 14.30C25.11 10.52 17.60 11.90 13.81 17.38C12.24 19.65 11.50 22.39 11.71 25.15L9.51 24.04L8.68 25.70L13.72 28.24L16.26 23.19L14.60 22.36Z" />
            <path d="M33.76 20.23L31.22 25.28L32.88 26.11L33.95 23.97C34.10 29.62 29.64 34.31 24.00 34.45C21.76 34.51 19.56 33.83 17.74 32.51L16.65 34.01C19.23 35.90 22.47 36.68 25.63 36.17C26.28 36.07 26.92 35.91 27.54 35.71C32.81 33.96 36.20 28.85 35.77 23.33L37.96 24.43L38.80 22.77L33.76 20.23Z" />
          </svg>
        </button>
        <span className="cf__label">Layout {layout + 1}</span>
      </div>

      <Plan id={productId} />

      <span className="cf__rule cfp__rule--bottom" />
      <div className="cfp__bar">
        <div className="cfp__group">
          <p className="cfp__label">Height</p>
          <div className="ph__sizes">
            {sizes(page).map((size) => (
              <button
                key={size.id}
                type="button"
                className={`ph__size${size.current ? ' is-on' : ''}`}
                aria-pressed={size.current}
                onClick={() => !size.current && setProductId(size.id)}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>
        <div className="cfp__group">
          <p className="cfp__label cfp__label--finish">
            {finish.name} <span>{finish.note}</span>
          </p>
          <div className="ph__swatches cfp__swatches" role="radiogroup" aria-label="Finish">
            {PALETTE.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={f.id === finish.id}
                aria-label={`${f.name} ${f.note}`}
                className={`ph__swatch${f.id === finish.id ? ' is-on' : ''}${f.id === 'warm_white' ? ' is-light' : ''}`}
                style={{ '--swatch': f.hex } as CSSProperties}
                onClick={() => setFinishId(f.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="cfp__steps">
        <button type="button" className="cfp__step" aria-label="Next layout" onClick={() => pickModel(layout + 1)}>
          <svg viewBox="0 0 12 11.2" aria-hidden="true">
            <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
          </svg>
        </button>
        <button type="button" className="cfp__step" aria-label="Previous layout" onClick={() => pickModel(layout - 1)}>
          <svg viewBox="0 0 12 11.2" aria-hidden="true">
            <path d="M12 5.6H1M5.8 0.8 1 5.6l4.8 4.8" />
          </svg>
        </button>
      </div>
      <button type="button" className="cfp__select" onClick={select}>
        <span className="cfp__select-title">Select</span>
        <span className="cfp__select-note">Add to quote</span>
      </button>
    </section>
  );
}
