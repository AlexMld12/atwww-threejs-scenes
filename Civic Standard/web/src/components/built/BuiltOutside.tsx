'use client';

import { useRef } from 'react';
import { Roll } from '@/components/ui/Roll';
import { BUILT_ITEMS } from './content';
import { TIMELINE } from './timeline';
import { useBuiltOutside } from './use-built-outside';

export function BuiltOutside() {
  const root = useRef<HTMLElement>(null);
  useBuiltOutside(root);

  return (
    <section ref={root} className="built" style={{ height: `calc(${TIMELINE.pinned + 1} * var(--stage-h))` }}>
      <div className="built__stage">
        {BUILT_ITEMS.map(({ photo }, i) => (
          <div key={photo.src} className="built__photo" data-photo={i}>
            {/* eslint-disable-next-line @next/next/no-img-element -- full-screen, already sized for it */}
            <img
              src={photo.src}
              alt=""
              style={{ objectPosition: `${photo.x * 100}% ${photo.y * 100}%`, scale: String(photo.zoom) }}
            />
          </div>
        ))}
        <div className="built__mask" />

        <div className="built__chrome" data-reveal>
          <span className="built__dot" />
          <span className="built__label">Built outside</span>
          <span className="built__track">
            <span className="built__bar" />
          </span>
        </div>

        <ol className="built__items">
          {BUILT_ITEMS.map(({ title, text }, i) => (
            <li key={title.join(' ')} className="built__item" data-item={i}>
              <span className="built__number">{String(i + 1).padStart(2, '0')}</span>
              <h2 className="built__title">
                {title[0]}
                <br />
                {title[1]}
              </h2>
              <div className="built__body">
                <p className="built__text">
                  {text.map((line) => (
                    <span key={line} className="built__line" data-line>
                      {line}
                    </span>
                  ))}
                </p>
                <div className="built__actions" data-line>
                  <button type="button" className="pill built__browse" aria-label="Browse the range">
                    <Roll text="Browse the range" />
                  </button>
                  <button type="button" className="pill pill--icon built__arrow" aria-label="Browse the range">
                    <svg viewBox="0 0 12 11.2" aria-hidden="true">
                      <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <span className="built__scroll" data-reveal>
          Scroll
          <span className="built__scroll-arrow">
            <svg viewBox="0 0 6.6 6.8" aria-hidden="true">
              <path d="M3.3 0v6.2M0.5 3.6l2.8 2.8 2.8-2.8" />
            </svg>
          </span>
        </span>
      </div>
    </section>
  );
}
