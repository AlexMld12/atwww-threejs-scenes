'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { cx, type CSSVars } from '@/lib/css';
import { easeOutCubic, prefersReducedMotion } from '@/lib/math';
import { bandLine, calibrated, formatReading, plan, type Answers } from '@/analysis/logic';
import { Button } from './Button';
import { cascade, useRevealed } from './cascade';

/** The END V1 scale: 55 ticks from 27 °C, 48.84 design px per degree (28 ° at 50, 34.4 ° at 362.6). */
const SCALE_TICKS = 55;
const scaleX = (t: number) => 1.16 + (t - 27) * 48.84;
const tickTemperature = (i: number) => 27 + (i * 8 + 2 - 1.16) / 48.84;
const designUnits = (n: number) => `calc(${n.toFixed(2)} * var(--sa-u))`;
const COUNT_FROM = 28;
const COUNT_MS = 900;

interface ReportScreenProps {
  answers: Answers;
  delay: number;
  leaving: boolean;
  onCart: (extra: { subscription: boolean; product?: string }) => void;
  onRetake: () => void;
}

export function ReportScreen({ answers, delay, leaving, onCart, onRetake }: ReportScreenProps) {
  const revealed = useRevealed();
  const result = useMemo(() => plan(answers), [answers]);
  const [today] = useState(() => calibrated());
  const [subscription, setSubscription] = useState(false);
  const shown = useCountUp(result.reading, delay + 0.25);
  const name = answers.name.trim();
  const t = result.reading;
  const next = cascade(delay);

  const labels: [number, string][] = [[28, '28°'], ...(Math.abs(t - 32) >= 0.9 ? [[32, '32°'] as [number, string]] : []), [t, `${formatReading(t)}°`]];
  const rows: [string, string, boolean?][] = [
    ...(name ? [['For', name.toUpperCase(), true] as [string, string, boolean]] : []),
    ['Skin reading', `${formatReading(t)}°C`],
    ['Target', '28.0°C'],
    ['Profile', result.profile],
    ['Calibrated', today],
    ['Kit ID', result.kitId],
  ];

  return (
    <section className={cx('sa-screen sa-report', revealed && 'is-revealed', leaving && 'is-leaving')}>
      <div className="sa-report__card sa-report__card--read">
        <p className="sa-rep__label mono" data-sa-in="" style={next()}>
          Your skin reading
        </p>
        <p className="sa-rep__value" data-sa-in="" style={next()} aria-label={`${formatReading(t)}°C`}>
          <span className="sa-rep__num">{formatReading(Math.round(shown * 10) / 10)}</span>
          <i className="sa-rep__deg" aria-hidden="true" />
          <span aria-hidden="true">C</span>
        </p>
        <p className="sa-rep__line" data-sa-in="" style={next()}>
          {bandLine(t, name)}
        </p>
        <p className="sa-rep__profile" data-sa-in="" style={next()}>
          Profile: {result.profile}. {result.type.desc}
        </p>
        <div data-sa-in="" style={next()}>
          <div className="sa-scale" style={{ '--x': designUnits(scaleX(shown)) } as CSSVars} aria-hidden="true">
            <div className="sa-scale__ticks">
              {Array.from({ length: SCALE_TICKS }, (_, i) => {
                const temperature = tickTemperature(i);
                return <i key={i} className={cx(temperature >= 27.95 && temperature < shown - 0.05 && 'is-on')} />;
              })}
            </div>
            <span className="sa-scale__mark" />
          </div>
          <div className="sa-scale__labels" aria-hidden="true">
            {labels.map(([value, label]) => (
              <span key={label} style={{ '--x': designUnits(scaleX(value)) } as CSSVars}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="sa-cal mono" data-sa-in="" style={next()}>
          <p className="sa-cal__title">Calibration</p>
          <dl className="sa-cal__rows">
            {rows.map(([key, value, ink]) => (
              <div key={key} className="sa-cal__row">
                <dt className={cx(ink && 'is-ink')}>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="sa-report__card sa-report__card--plan">
        <h2 className="sa-plan__title" data-sa-in="" style={next()}>
          Your recovery routine
        </h2>
        <p className="sa-plan__sub" data-sa-in="" style={next()}>
          {result.focus}
        </p>
        <ul className="sa-kits">
          {result.products.map((product) => (
            <li key={product.code} className="sa-kit" data-sa-in="" style={next()}>
              <Image className="sa-kit__icon" src="/images/sa-kit.svg" alt="" width={62} height={62} />
              <p className="sa-kit__name">
                {product.code} {product.name}
              </p>
              <p className="sa-kit__when">{product.when}</p>
              <p className="sa-kit__text">{product.text}</p>
            </li>
          ))}
        </ul>
        <ul className="sa-notes" data-sa-in="" style={next()}>
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {result.subscription && (
          <label className="sa-consent sa-sub-opt" data-sa-in="" style={next()}>
            <input type="checkbox" checked={subscription} onChange={(event) => setSubscription(event.target.checked)} />
            <span>Refill every 28 days and save</span>
          </label>
        )}
        <div className="sa-buy" data-sa-in="" style={next()}>
          <Button variant="primary" label="Add the recovery kit to cart" onClick={() => onCart({ subscription })} />
          <Button variant="ghost" label="Retake the reading" onClick={onRetake} />
        </div>
        {result.k2Offer && (
          <div data-sa-in="" style={next()}>
            <Button
              variant="ghost"
              className="sa-offer"
              label="Already have a routine? Start with K2 Active Serum"
              onClick={() => onCart({ subscription, product: 'k2-active-serum' })}
            />
          </div>
        )}
        <p className="sa-disclaimer" data-sa-in="" style={next()}>
          This reading is a guide based on your answers, not a medical diagnosis. If your skin reacts strongly, talk to a
          dermatologist.
        </p>
      </div>
    </section>
  );
}

/** Counts 28.0 → the reading, starting `delay` seconds after mount. */
function useCountUp(target: number, delay: number) {
  const [value, setValue] = useState(COUNT_FROM);
  useEffect(() => {
    let frame = 0;
    const timer = setTimeout(() => {
      if (prefersReducedMotion()) return setValue(target);
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / COUNT_MS);
        setValue(COUNT_FROM + (target - COUNT_FROM) * easeOutCubic(k));
        if (k < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delay * 1000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, delay]);
  return value;
}
