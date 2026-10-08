'use client';

import { useState, type FormEvent, type Ref } from 'react';
import { ArrowIcon, ErrorIcon } from '@/components/ui/icons';
import { Reveal } from '@/components/ui/Reveal';
import { RollText } from '@/components/ui/RollText';
import { cx } from '@/lib/css';
import { PageLink } from '@/components/layers/PageLink';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 07: consent unlocks with a valid email, sending with the consent (drinksom join-drop); no backend yet. */
export function Join({ ref }: { ref?: Ref<HTMLElement> }) {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [consent, setConsent] = useState(false);

  const value = email.trim();
  const valid = EMAIL.test(value);
  const showError = touched && value.length > 0 && !valid;
  const canSend = valid && consent;

  const onSubmit = (event: FormEvent) => event.preventDefault();

  return (
    <section ref={ref} className="join" id="join">
      <div className="join__sticky">
        <h2 className="join__title" aria-label="Become someone powerful">
          <Reveal as="span" className="join__line" aria-hidden>
            Become
          </Reveal>
          <Reveal as="span" className="join__line" delay={0.07} aria-hidden>
            <span className="join__exp">Som</span>
            <span>eone</span>
          </Reveal>
          <Reveal as="span" className="join__line" delay={0.14} aria-hidden>
            Powerful
          </Reveal>
        </h2>
        <Reveal className="join__text mono" delay={0.2} lines>
          Get KELV routine notes, product news and daily recovery tips.
        </Reveal>

        <form className="join__form" noValidate onSubmit={onSubmit}>
          <div className={cx('field', showError && 'is-error')}>
            <input
              className="field__input mono"
              id="join-email"
              type="email"
              name="email"
              placeholder=" "
              autoComplete="email"
              spellCheck={false}
              aria-invalid={showError}
              value={email}
              onChange={(event) => {
                const next = event.target.value;
                setEmail(next);
                if (!EMAIL.test(next.trim())) setConsent(false);
              }}
              onBlur={() => setTouched(true)}
            />
            <label className="field__label mono" htmlFor="join-email">
              Email address
            </label>
          </div>
          <p className="field__error mono" role="alert" hidden={!showError}>
            <ErrorIcon />
            <span>Invalid email address</span>
          </p>
          <div className={cx('consent', !valid && 'is-disabled')}>
            <span className="consent__box">
              <input
                className="consent__input"
                id="join-consent"
                type="checkbox"
                name="consent"
                disabled={!valid}
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <svg className="consent__check" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 8L7 11L12 5" pathLength={1} />
              </svg>
            </span>
            <label className="consent__label mono" htmlFor="join-consent">
              By submitting, you agree to our <PageLink href="/privacy-policy">Privacy Policy</PageLink>
            </label>
          </div>
          <button className="join__send mono" type="submit" disabled={!canSend} data-roll-host="">
            <RollText text="Join club" />
            <ArrowIcon />
          </button>
        </form>
      </div>
    </section>
  );
}
