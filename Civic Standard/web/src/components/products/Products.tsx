'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { designCss, topForBaseline } from '@/lib/design';
import { navigate, onEnter } from '@/lib/routes';
import { slugById } from '../product/content';
import { textTop } from '../details/place';
import { CARDS, CATEGORIES, LAYOUT, PRODUCT_COUNT, SWATCHES, TITLE, type Card } from './content';

// Motion: floema.com/en/products (their page read and measured) with the site's own pieces.
// - Entrance, from the uncover (or the preloader's handover): the title's lines drop in from above (0.8 s circ.out,
//   0.05 apart), the category cards from half their height (0.8 s, 0.02 apart), the labels after them (1.2 s
//   power4.out), the first six cards rise 200 px (0.8 s circ.out, 0.1 apart, from 0.4 s); the rules draw from the left.
// - Theirs stop there; ours: every other card rises 60 px as it comes into view (85 %, as every reveal).
// - Filtering: the cards leave (30 px down, faded, 0.35 s power1.out), the list changes, the new ones come up together
//   (0.45 s power2.out, 0.1 s late). A category is chosen by a click, let go by a second one.
const OUT_MS = 350;
const FIRST = 6;

const key = (card: Card) => `${card.row}-${card.col}`;

/** The text's top from its baseline measured from the card's foot (Figma px). */
const fromFoot = (font: 'sans' | 'mono', baseline: number, size: number, lineHeight: number) =>
  `calc(100% + ${designCss(topForBaseline(font, -baseline, size, lineHeight))})`;

function Swatches({ finish }: { finish: string }) {
  return (
    <span className="pp__swatches" aria-label={`Finish: ${finish}`}>
      {SWATCHES.map(({ name, colour }) => (
        <span
          key={name}
          className={`pp__swatch${name.toLowerCase() === finish.toLowerCase() ? ' is-on' : ''}`}
          style={{ '--swatch': colour } as CSSProperties}
        />
      ))}
    </span>
  );
}

function ProductCard({ card }: { card: Card }) {
  if (card.catalogue) {
    return (
      <div className="pp__catalogue">
        {/* eslint-disable-next-line @next/next/no-img-element -- the photo as Figma crops it */}
        <img className="pp__photo" src="/products/catalogue.webp" alt="" />
        <span className="pp__shade" />
        <span className="pp__pdf" style={{ top: textTop('sans', 37, 14, 18) }}>
          PDF
        </span>
        <span className="pp__tag">Catalogue</span>
        <span className="pp__download-title" style={{ top: fromFoot('sans', 28, 34, 36) }}>
          Download the full catalogue
        </span>
        <button type="button" className="pp__download" aria-label="Download the full catalogue">
          <svg viewBox="0 0 11 12.2" aria-hidden="true">
            <path d="M5.5 0v8.6M1.6 4.8l3.9 3.9 3.9-3.9M0 11.6h11" />
          </svg>
        </button>
      </div>
    );
  }
  if (!card.id) return null;
  const [left, top, size] = card.image!;
  return (
    <>
      <span className="pp__veil" />
      {/* eslint-disable-next-line @next/next/no-img-element -- a catalogue render, placed as Figma places it */}
      <img
        className="pp__render"
        src={`/products/${card.id}.webp`}
        alt=""
        style={{ left: `${left}%`, top: `${top}%`, width: `${size}%`, '--size': size } as CSSProperties}
      />
      <h3 className="pp__name" style={{ top: textTop('sans', 35, 16, 20) }}>
        {card.name}
      </h3>
      <span className="pp__tag">{card.tag}</span>
      <span className="pp__finish" style={{ top: fromFoot('sans', 45, 12, 15) }}>
        {card.finish}
      </span>
      <Swatches finish={card.finish!} />
      <span className="pp__measure" style={{ top: fromFoot('mono', 23, 11, 15) }}>
        {card.measure}
      </span>
    </>
  );
}

export function Products() {
  const root = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [shownCategory, setShownCategory] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'out' | 'pre' | 'in'>('idle');
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  const cards = shownCategory ? CARDS.filter((card) => card.id && card.tag === shownCategory) : CARDS;
  const count = shownCategory ? cards.length : PRODUCT_COUNT;

  useEffect(() => onEnter((view) => view === 'products' && setEntered(true)), []);

  // ours: a card past the first six rises as it comes into view
  useEffect(() => {
    if (!entered) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const keys = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => (entry.target as HTMLElement).dataset.key!);
        if (!keys.length) return;
        keys.forEach((k) => observer.unobserve(root.current!.querySelector(`[data-key="${k}"]`)!));
        setRevealed((previous) => new Set([...previous, ...keys]));
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    root.current!.querySelectorAll<HTMLElement>('.pp__card:not(.is-shown)').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [entered, shownCategory]);

  // a click picks a category, a second one lets it go; the grid fades out, changes, comes back
  const choose = (tag: string) => {
    const next = category === tag ? null : tag;
    setCategory(next);
    setPhase('out');
    window.setTimeout(() => {
      setShownCategory(next);
      setPhase('pre');
      setRevealed(new Set(CARDS.map(key)));
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('in')));
      window.setTimeout(() => setPhase('idle'), 600);
    }, OUT_MS);
  };

  return (
    <section ref={root} className={`pp${entered ? ' is-entered' : ''}`}>
      <span className="pp__rule pp__rule--full" style={{ top: designCss(LAYOUT.navRule) }} />
      <h1 className="pp__title" aria-label={TITLE.join(' ')}>
        {TITLE.map((line, i) => (
          <span
            key={line}
            className="pp__title-line pp__drop"
            style={{ top: textTop('sans', LAYOUT.titleBaselines[i], 65, 65), '--i': i } as CSSProperties}
            aria-hidden="true"
          >
            <span className="pp__drop-inner">{line}</span>
          </span>
        ))}
      </h1>

      <p
        className="pp__label pp__drop pp__drop--label"
        style={{ top: textTop('mono', LAYOUT.filterBaseline, 12, 16.3) }}
      >
        <span className="pp__drop-inner">
          <span className="pp__key">Filter by:</span>
          <span className="pp__value">Category</span>
        </span>
      </p>
      <span className="pp__rule" style={{ top: designCss(LAYOUT.filterRule) }} />

      <div
        className="pp__categories"
        role="group"
        aria-label="Category"
        style={{ top: designCss(LAYOUT.categoriesTop) }}
      >
        {CATEGORIES.map(({ name, id, image, tag }, i) => (
          <button
            key={name}
            type="button"
            className={`pp__category${category === tag ? ' is-active' : ''}`}
            aria-pressed={category === tag}
            style={{ left: designCss(i * LAYOUT.categoryStep), '--i': i } as CSSProperties}
            onClick={() => choose(tag)}
          >
            <span className="pp__category-image">
              {/* eslint-disable-next-line @next/next/no-img-element -- a catalogue render, placed as Figma places it */}
              <img
                src={`/products/${id}.webp`}
                alt=""
                style={{ left: designCss(image[0] - 3), top: designCss(image[1] - 3), width: designCss(image[2]) }}
              />
            </span>
            <span className="pp__category-name">{name}</span>
          </button>
        ))}
      </div>

      <span className="pp__rule" style={{ top: designCss(LAYOUT.countRule) }} />
      <p
        className="pp__label pp__drop pp__drop--count"
        style={{ top: textTop('mono', LAYOUT.countBaseline, 12, 16.3) }}
      >
        <span className="pp__drop-inner">
          <span className="pp__key">Showing:</span>
          <span className="pp__value">
            {count}/{PRODUCT_COUNT} results
          </span>
        </span>
      </p>

      <div className={`pp__grid pp__grid--${phase}${shownCategory ? ' is-filtered' : ''}`}>
        {cards.map((card, i) => {
          const k = key(card);
          const intro = !shownCategory && i < FIRST;
          const shown = (intro && entered) || revealed.has(k);
          return (
            <article
              key={k}
              data-key={k}
              data-w={card.w}
              data-h={card.h}
              data-empty={!card.id && !card.catalogue ? '' : undefined}
              onClick={card.id ? () => navigate('product', slugById(card.id!)) : undefined}
              className={`pp__card${card.catalogue ? ' pp__card--catalogue' : ''}${shown ? ' is-shown' : ''}${intro ? ' is-intro' : ''}`}
              style={
                {
                  gridColumn: shownCategory ? `span ${card.w}` : `${card.col + 1} / span ${card.w}`,
                  gridRow: shownCategory ? `span ${card.h}` : `${card.row + 1} / span ${card.h}`,
                  '--i': i,
                } as CSSProperties
              }
            >
              <ProductCard card={card} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
