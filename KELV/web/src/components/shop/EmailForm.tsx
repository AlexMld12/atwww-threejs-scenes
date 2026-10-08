'use client';

import { useState, type FormEvent } from 'react';
import { PageLink } from '@/components/layers/PageLink';
import { ArrowIcon } from '@/components/ui/icons';
import { RollText } from '@/components/ui/RollText';
import { SweepLine } from '@/components/ui/SweepLine';
import { cx } from '@/lib/css';

/** RECEIVE UPDATES (with the privacy checkbox) and NOTIFY ME: no list behind them yet, a valid submit clears the field. */
export function EmailForm({ variant }: { variant: 'updates' | 'notify' }) {
  const [email, setEmail] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setEmail('');
  };
  const updates = variant === 'updates';
  return (
    <form className={cx('shop-form', `shop-form--${variant}`)} onSubmit={submit}>
      <input
        className="shop-input mono"
        type="email"
        required
        placeholder="Email address"
        aria-label="Email address"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {updates && (
        <label className="shop-check mono">
          <input type="checkbox" required />
          <span>
            I accept the{' '}
            <PageLink href="/privacy-policy" className="sweep sweep--line shop-check__link">
              privacy policy
              <SweepLine />
            </PageLink>
          </span>
        </label>
      )}
      <button
        type="submit"
        className={cx('shop-btn shop-btn--center mono', updates ? 'shop-btn--dark shop-btn--slim' : 'shop-btn--orange')}
        data-roll-host=""
      >
        <RollText text={updates ? 'Subscribe' : 'Notify me'} />
        <ArrowIcon />
      </button>
    </form>
  );
}
