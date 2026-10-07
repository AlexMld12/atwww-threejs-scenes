'use client';

import { cx } from '@/lib/css';
import { Button } from './Button';
import { cascade, useRevealed } from './cascade';

export function StartScreen({ delay, leaving, onStart }: { delay: number; leaving: boolean; onStart: () => void }) {
  const revealed = useRevealed();
  const next = cascade(delay);
  return (
    <section className={cx('sa-screen sa-start', revealed && 'is-revealed', leaving && 'is-leaving')}>
      <h1 className="sa-start__title" aria-label="Take your skin reading today!">
        <span className="sa-start__cond" data-sa-in="" style={next()} aria-hidden="true">
          Take your
        </span>
        <span className="sa-start__exp" data-sa-in="" style={next()} aria-hidden="true">
          Skin reading
        </span>
        <span className="sa-start__cond" data-sa-in="" style={next()} aria-hidden="true">
          Today!
        </span>
      </h1>
      <p className="sa-start__text mono" data-sa-in="" style={next()}>
        Seven quick questions about your skin and the heat it lives with: sun, training, saunas, screens and city air.
      </p>
      <p className="sa-start__text mono" data-sa-in="" style={next()}>
        At the end you get a reading and a routine for the three steps of the KELV° recovery kit.
      </p>
      <p className="sa-start__note mono" data-sa-in="" style={next()}>
        Takes about two minutes. No photo needed.
      </p>
      <div data-sa-in="" style={next()}>
        <Button variant="primary" className="sa-start__btn" label="Start the reading" arrow onClick={onStart} />
      </div>
    </section>
  );
}
