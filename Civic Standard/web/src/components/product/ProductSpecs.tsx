'use client';

import { useRef, useState } from 'react';
import { designCss } from '@/lib/design';
import { textTop } from '../details/place';
import { useDrift } from '../details/use-drift';
import { useReveal } from '../details/use-reveal';
import { SPEC, specs, type Page } from './content';
import { DownloadIcon } from './DownloadIcon';
import { Picture } from './Picture';
import profiles from './profiles.json';
import { Statement } from './Statement';

/**
 * The product in line (tools/blender_profiles.py), Figma's bench at its scale, any other fitted to the same box; it
 * drifts sideways with the scroll, as the home's bench drawing (use-drift).
 */
function Drawing({ id }: { id: string }) {
  const image = useRef<HTMLImageElement>(null);
  useDrift(image);
  const profile = (profiles as Record<string, { mm: number[]; margin: number }>)[id];
  if (!profile) return <div className="spec__drawing" />;
  const [width, height] = profile.mm;
  const { scale: most, width: boxW, height: boxH } = SPEC.drawing;
  const scale = Math.min(most, boxW / width, boxH / height);
  const margin = profile.margin * scale;
  return (
    <div className="spec__drawing" data-reveal="rise">
      {/* eslint-disable-next-line @next/next/no-img-element -- a line drawing, sized from its millimetres */}
      <img
        ref={image}
        className="spec__drawing-img"
        src={`/profiles/${id}.webp`}
        alt=""
        style={{
          left: designCss(-margin),
          bottom: designCss(-margin),
          width: designCss(width * scale + 2 * margin),
          height: designCss(height * scale + 2 * margin),
        }}
      />
    </div>
  );
}

// Motion: the statement fills with the scroll (Statement.tsx), as THE BENCH's; the labels rise in their masks, the
// rules draw from the left and the rest rises a little as each comes into view (use-reveal); the picture is
// uncovered from below. The spec sheet's card folds its file's corner on hover.
export function ProductSpecs({ page }: { page: Page }) {
  const root = useRef<HTMLElement>(null);
  const [hover, setHover] = useState(false);
  const { statement, rows, notes } = specs(page);
  useReveal(root);

  return (
    <section ref={root} className="spec">
      <span className="spec__rule spec__rule--top" data-reveal="rule" />
      <Statement className="spec__statement" text={statement} />

      <div className="spec__row spec__row--drawing">
        <p
          className="spec__label lines"
          data-reveal="lines"
          style={{ top: textTop('mono', SPEC.labelBaseline, 12, 16.3) }}
        >
          <span className="line">
            <span className="line__inner">Specifications</span>
          </span>
        </p>
        <Drawing id={page.id} />
      </div>

      <dl className="spec__table">
        {rows.map(([label, value]) => (
          <div key={label} className="spec__entry">
            <span className="spec__rule" data-reveal="rule" />
            <dt className="spec__title" data-reveal="rise">
              {label}
            </dt>
            <dd className="spec__text" data-reveal="rise">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="spec__notes">
        {notes.map(({ title, text }) => (
          <div key={title} className="spec__note" data-reveal="rise">
            <h3 className="spec__title">{title}</h3>
            <p className="spec__text">{text}</p>
          </div>
        ))}
      </div>

      <div className="spec__row spec__row--sheet">
        <p
          className="spec__label lines"
          data-reveal="lines"
          style={{ top: textTop('mono', SPEC.sheetLabelBaseline, 12, 16.3) }}
        >
          <span className="line">
            <span className="line__inner">Spec sheet and CAD</span>
          </span>
        </p>
        <button
          type="button"
          className="spec__sheet"
          data-reveal="rise"
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
        >
          <span className="spec__title">Download spec sheet</span>
          <DownloadIcon folded={hover} />
        </button>
      </div>

      <Picture product={page.id} view="front" className="spec__picture" />
    </section>
  );
}
