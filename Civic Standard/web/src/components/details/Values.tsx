'use client';

import { useRef } from 'react';
import { designCss } from '@/lib/design';
import { VALUES } from './content';
import { Lines } from './Lines';
import { fromCentre, fromLeft, textTop } from './place';
import { useDrift } from './use-drift';
import { useReveal } from './use-reveal';

const RIGHT_COLUMN = 630;
const ROW_TEXT = 890;

export function Values() {
  const root = useRef<HTMLElement>(null);
  const benches = useRef<HTMLImageElement>(null); // drifts inside its box, which is uncovered from the bottom
  useReveal(root);
  useDrift(benches);

  return (
    <section ref={root} className="dv dv--values">
      <span className="dv__rule" data-reveal="rule" />
      <Lines
        as="h2"
        lines={['Our values']}
        className="dv__label"
        style={{ top: textTop('mono', 34, 12, 16.3), left: fromLeft(30) }}
      />
      <Lines
        lines={VALUES.statement}
        className="dv__statement"
        style={{ top: textTop('sans', VALUES.statementBaseline, 44, 44), left: fromCentre(RIGHT_COLUMN) }}
      />

      {VALUES.rows.map(({ label, rule, baseline, text }) => (
        <div key={label} className="dv__row">
          <span
            className="dv__row-rule"
            style={{ top: designCss(rule), left: fromCentre(RIGHT_COLUMN) }}
            data-reveal="rule"
          />
          <Lines
            lines={[label]}
            className="dv__row-label"
            style={{ top: textTop('inter', baseline, 14.5, 18), left: fromCentre(RIGHT_COLUMN) }}
          />
          <Lines
            lines={text}
            className="dv__row-text"
            style={{ top: textTop('sans', baseline - 1, 16, 21), left: fromCentre(ROW_TEXT) }}
          />
        </div>
      ))}

      {VALUES.services.map(({ title, text }, i) => {
        const baseline = VALUES.serviceBaseline + i * VALUES.serviceStep;
        return (
          <div key={title} className="dv__service">
            <Lines
              lines={[title]}
              className="dv__service-title"
              style={{ top: textTop('sans', baseline, 14, 17), left: fromCentre(RIGHT_COLUMN) }}
            />
            <Lines
              lines={[text]}
              className="dv__service-text"
              style={{ top: textTop('sans', baseline + 17, 12, 15), left: fromCentre(RIGHT_COLUMN) }}
            />
            {i < VALUES.services.length - 1 && (
              <span
                className="dv__service-rule"
                style={{ top: designCss(baseline + 36), left: fromCentre(RIGHT_COLUMN) }}
                data-reveal="rule"
              />
            )}
          </div>
        );
      })}

      <div className="dv__benches" data-reveal="image">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small line drawing, from Figma */}
        <img ref={benches} src="/values/benches.svg" alt="" />
      </div>
    </section>
  );
}
