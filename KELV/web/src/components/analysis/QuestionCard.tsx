'use client';

import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ErrorIcon } from '@/components/ui/icons';
import { cx } from '@/lib/css';
import { EMAIL, ERROR_CONSENT, ERROR_EMAIL, STEPS, isAnswered, type Answers, type Step } from '@/analysis/logic';
import { Button } from './Button';
import { cascade, useRevealed } from './cascade';
import { PageLink } from '@/components/layers/PageLink';

export const OUT_MS = 260;
const HEIGHT_TRANSITION = 'height 0.6s cubic-bezier(0.76, 0, 0.24, 1)';
const STEP_DELAY = 0.05;
export const LETTERS = 'ABCDEF';

type Field = 'name' | 'email' | 'consent';

interface Handlers {
  onChoose: (option: number) => void;
  onField: (field: Field, value: string | boolean) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

interface QuestionCardProps extends Handlers {
  step: number;
  answers: Answers;
  delay: number;
  leaving: boolean;
}

/** Steps 1–7 share one card: the old content fades, the card animates its height, the new one comes in. */
export function QuestionCard({ step, answers, delay, leaving, ...handlers }: QuestionCardProps) {
  const [shown, setShown] = useState(step);
  const cardRef = useRef<HTMLDivElement>(null);
  const fromHeight = useRef<number | null>(null);
  const [firstStep] = useState(step);
  const out = step !== shown;

  useEffect(() => {
    if (!out) return;
    fromHeight.current = cardRef.current?.getBoundingClientRect().height ?? null;
    const timer = setTimeout(() => setShown(step), OUT_MS);
    return () => clearTimeout(timer);
  }, [out, step]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const from = fromHeight.current;
    if (!card || from === null) return;
    fromHeight.current = null;
    card.style.height = 'auto';
    const to = card.getBoundingClientRect().height;
    card.style.height = `${from}px`;
    void card.offsetHeight;
    card.style.transition = HEIGHT_TRANSITION;
    card.style.height = `${to}px`;
    const reset = () => {
      card.style.height = '';
      card.style.transition = '';
    };
    card.addEventListener('transitionend', reset, { once: true });
    const fallback = setTimeout(reset, 700);
    return () => clearTimeout(fallback);
  }, [shown]);

  const current = STEPS[shown];
  const bodyDelay = shown === firstStep ? delay : STEP_DELAY;
  return (
    <section className={cx('sa-screen sa-qwrap', current.kind === 'form' && 'sa-form', leaving && 'is-leaving')}>
      <div ref={cardRef} className="sa-card">
        <div className="sa-card__head mono">
          <StepLabel key={shown} index={shown} delay={bodyDelay} out={out} />
        </div>
        {current.kind === 'form' ? (
          <ContactBody key={shown} step={current} answers={answers} delay={bodyDelay} out={out} {...handlers} />
        ) : (
          <OptionsBody
            key={shown}
            index={shown}
            step={current}
            answers={answers}
            delay={bodyDelay}
            out={out}
            {...handlers}
          />
        )}
      </div>
    </section>
  );
}

function StepLabel({ index, delay, out }: { index: number; delay: number; out: boolean }) {
  const revealed = useRevealed();
  return (
    <span className={cx(revealed && 'is-revealed', out && 'is-out')} data-sa-in="" style={cascade(delay)()}>
      Step {index + 1} of {STEPS.length}
    </span>
  );
}

interface BodyProps extends Handlers {
  answers: Answers;
  delay: number;
  out: boolean;
}

function OptionsBody({
  index,
  step,
  answers,
  delay,
  out,
  onChoose,
  onBack,
  onNext,
}: BodyProps & { index: number; step: Exclude<Step, { kind: 'form' }> }) {
  const revealed = useRevealed();
  const [whyOpen, setWhyOpen] = useState(false);
  const next = cascade(delay);
  const multi = step.kind === 'multi';
  const selected = (key: string) =>
    step.kind === 'multi' ? answers[step.key].includes(key) : answers[step.key] === key;
  const whyId = `sa-why-${index}`;

  return (
    <div className={cx('sa-card__body', revealed && 'is-revealed', out && 'is-out')}>
      <h2 className="sa-q__title" data-sa-in="" style={next()}>
        {step.title}
      </h2>
      <p className="sa-q__sub" data-sa-in="" style={next()}>
        {step.sub}
      </p>
      <div className={cx('sa-why', whyOpen && 'is-open')} data-sa-in="" style={next()}>
        <button
          className="sa-why__btn"
          type="button"
          aria-expanded={whyOpen}
          aria-controls={whyId}
          onClick={() => setWhyOpen((open) => !open)}
        >
          <Image className="sa-why__icon" src="/images/sa-why.svg" alt="" width={16} height={16} />
          Why we ask
        </button>
        <div className="sa-why__panel" id={whyId}>
          <p>{step.why}</p>
        </div>
      </div>
      <ul className="sa-opts" role={multi ? 'group' : 'radiogroup'} aria-label={step.title}>
        {step.options.map((option, k) => (
          <li key={option.key} data-sa-in="" style={next()}>
            <button
              className="sa-opt"
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={selected(option.key)}
              onClick={() => onChoose(k)}
            >
              <span className="sa-opt__key" aria-hidden="true">
                {LETTERS[k]}
              </span>
              <span>{option.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sa-nav" data-sa-in="" style={next()}>
        <Button variant="ghost" label="Back" onClick={onBack} />
        <Button variant="primary" label="Continue" arrow disabled={!isAnswered(answers, step.key)} onClick={onNext} />
      </div>
      <p className="sa-hint" data-sa-in="" style={next()}>
        PRESS a letter to choose, ENTER to continue.
      </p>
    </div>
  );
}

function ContactBody({
  step,
  answers,
  delay,
  out,
  onField,
  onBack,
  onSubmit,
}: BodyProps & { step: Extract<Step, { kind: 'form' }> }) {
  const revealed = useRevealed();
  const [emailError, setEmailError] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const next = cascade(delay);
  const email = answers.email.trim();

  const submit = () => {
    const badEmail = Boolean(email) && !EMAIL.test(email);
    const missingEmail = answers.consent && !email;
    setEmailError(badEmail);
    setConsentError(missingEmail);
    if (!badEmail && !missingEmail) onSubmit();
  };

  return (
    <div className={cx('sa-card__body', revealed && 'is-revealed', out && 'is-out')}>
      <h2 className="sa-q__title" data-sa-in="" style={next()}>
        {step.title}
      </h2>
      <p className="sa-q__sub" data-sa-in="" style={next()}>
        {step.sub}
      </p>
      <div className="sa-field" data-sa-in="" style={next()}>
        <label className="sa-field__label" htmlFor="sa-name">
          Your name
        </label>
        <input
          className="sa-field__input"
          id="sa-name"
          name="name"
          autoComplete="given-name"
          value={answers.name}
          onChange={(event) => onField('name', event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
        />
      </div>
      <div className={cx('sa-field', emailError && 'is-error')} data-sa-in="" style={next()}>
        <label className="sa-field__label" htmlFor="sa-email">
          Email
        </label>
        <input
          className="sa-field__input"
          id="sa-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={answers.email}
          onChange={(event) => {
            const value = event.target.value;
            onField('email', value);
            if (EMAIL.test(value.trim())) setEmailError(false);
            if (value.trim()) setConsentError(false);
          }}
          onBlur={() => setEmailError(Boolean(email) && !EMAIL.test(email))}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
        />
        <FieldError message={emailError ? ERROR_EMAIL : null} />
      </div>
      <label className="sa-consent" data-sa-in="" style={next()}>
        <input
          type="checkbox"
          name="consent"
          checked={answers.consent}
          onChange={(event) => {
            onField('consent', event.target.checked);
            if (!event.target.checked) setConsentError(false);
          }}
        />
        <span>
          By submitting, you agree to our <PageLink href="/privacy-policy">Privacy policy</PageLink>
        </span>
      </label>
      <FieldError message={consentError ? ERROR_CONSENT : null} />
      <p className="sa-form__info" data-sa-in="" style={next()}>
        We only use your email for your reading and the reminders you choose.
        <br />
        You can unsubscribe at any time.
      </p>
      <div className="sa-nav" data-sa-in="" style={next()}>
        <Button variant="ghost" label="Back" onClick={onBack} />
        <Button variant="blue" label="See my reading" onClick={submit} />
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string | null }) {
  return (
    <p className="sa-err" role="alert" hidden={!message}>
      <ErrorIcon />
      <span>{message}</span>
    </p>
  );
}
