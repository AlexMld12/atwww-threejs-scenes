'use client';

import type { Ref } from 'react';
import { addToQuote, openQuote, setQuantity } from '@/lib/quote';
import { navigate } from '@/lib/routes';
import { detailsOf, type Project } from './content';

// Figma's arrow (Product CMS.pdf), as the navbar's Back; turned for Next
const ARROW = 'M5.26 10.45 6.02 9.72 2.03 5.72h9.35V4.68H2.03L6.01.7 5.26-.05C3.34 1.87 1.86 3.36.02 5.2z';

/**
 * A project's panel (Project Page CMS.pdf, Scrollable Info - Project.pdf): the quote list's drawer, with the project
 * in it. The head stays (its arrows go through the projects), the rest scrolls; the foot asks for a quote on what
 * the project used. SEND QUOTE REQUEST puts that product, in that finish and number, on the quote list and opens it.
 */
export function ProjectPanel({
  ref,
  project,
  open,
  onPrevious,
  onNext,
}: {
  ref: Ref<HTMLElement>;
  project: Project;
  open: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const details = detailsOf(project);
  const quote = () => {
    const key = addToQuote(project.product, project.finish);
    setQuantity(key, project.pieces);
    openQuote();
  };

  return (
    <aside
      ref={ref}
      className={`pjp${open ? ' is-open' : ''}`}
      aria-label={project.name}
      inert={!open}
      data-lenis-prevent
    >
      <header className="pjp__head">
        <p className="pjp__label">Project name</p>
        <h1 className="pjp__title">{project.name}</h1>
        <div className="pjp__arrows">
          <button type="button" className="pjp__arrow" aria-label="Previous project" onClick={onPrevious}>
            <svg viewBox="0 -0.05 11.4 10.5" aria-hidden="true">
              <path d={ARROW} />
            </svg>
          </button>
          <button type="button" className="pjp__arrow pjp__arrow--next" aria-label="Next project" onClick={onNext}>
            <svg viewBox="0 -0.05 11.4 10.5" aria-hidden="true">
              <path d={ARROW} />
            </svg>
          </button>
        </div>
      </header>

      {/* a new project fades in (the arrows) */}
      <div key={project.slug} className="pjp__scroll">
        {/* eslint-disable-next-line @next/next/no-img-element -- the render, cropped as the panel's frame */}
        <img
          className="pjp__picture"
          src={`/projects/${project.slug}-m.webp`}
          alt={`${project.name}, ${project.place}`}
        />
        <p className="pjp__lead">{project.lead}</p>

        <div className="pjp__columns">
          {details.columns.map(({ title, text }) => (
            <div key={title}>
              <h2 className="pjp__heading">{title}</h2>
              <p className="pjp__text">{text}</p>
            </div>
          ))}
        </div>

        <div className="pjp__block pjp__block--first">
          <h2 className="pjp__heading">Materials</h2>
          <p className="pjp__text">{details.materials}</p>
        </div>
        <div className="pjp__block">
          <h2 className="pjp__heading">Dimensions</h2>
          <p className="pjp__text">{details.dimensions}</p>
        </div>
        <div className="pjp__block pjp__block--boxed">
          <h2 className="pjp__heading">Finish</h2>
          <p className="pjp__text">{details.finish}</p>
        </div>

        <p className="pjp__lead pjp__story">{project.story}</p>

        <div className="pjp__product">
          <div className="pjp__drawing">
            {/* eslint-disable-next-line @next/next/no-img-element -- the product's line drawing (product page) */}
            <img src={`/profiles/${project.product}.webp`} alt="" />
          </div>
          <div className="pjp__about">
            <h2 className="pjp__heading">Product</h2>
            <button
              type="button"
              className="pjp__text pjp__link"
              onClick={() => navigate('product', details.product.slug)}
            >
              {details.product.name}
            </button>
            <p className="pjp__text pjp__place">{project.place}</p>
          </div>
        </div>

        <footer className="qd__foot pjp__foot">
          <p className="qd__summary">{details.quote}</p>
          <div className="qd__send">
            <button type="button" className="qd__submit" onClick={quote}>
              Send quote request
            </button>
            <button
              type="button"
              className="qd__submit qd__submit--arrow"
              aria-label="Send quote request"
              onClick={quote}
            >
              <svg viewBox="0 0 12 11.2" aria-hidden="true">
                <path d="M0 5.6h11M6.2 0.8l4.8 4.8-4.8 4.8" />
              </svg>
            </button>
          </div>
        </footer>
      </div>
    </aside>
  );
}
