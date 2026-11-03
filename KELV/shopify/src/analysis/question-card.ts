import { EMAIL, ERROR_EMAIL, STEPS, isAnswered, type Answers, type Step } from './logic';
import { button, cascade, el, icon, revealSoon } from './dom';

export const OUT_MS = 260;
const HEIGHT_TRANSITION = 'height 0.6s cubic-bezier(0.76, 0, 0.24, 1)';
const STEP_DELAY = 0.05;
export const LETTERS = 'ABCDEF';

export type Field = 'name' | 'email' | 'consent';

export interface QuizContext {
  /** Where the section keeps its icon templates. */
  root: ParentNode;
  whyIcon: string;
  /** The consent line: its text, then a link (the privacy policy's marketing section). */
  consent: { text: string; link: string; url: string };
  answers: () => Answers;
  onChoose: (option: number) => void;
  onField: (field: Field, value: string | boolean) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

interface Body {
  element: HTMLElement;
  /** Brings the selection and the buttons in line with the answers. */
  refresh: () => void;
}

/** Steps 1–7 share one card: the old content fades, the card animates its height, the new one comes in. */
export class QuestionCard {
  readonly element: HTMLElement;
  private readonly card: HTMLElement;
  private readonly head: HTMLElement;
  private label!: HTMLElement;
  private body!: Body;
  private shown: number;
  private step: number;
  private timer = 0;

  constructor(
    private readonly ctx: QuizContext,
    step: number,
    private readonly delay: number,
  ) {
    this.step = this.shown = step;
    this.head = el('div', { class: 'sa-card__head mono' });
    this.card = el('div', { class: 'sa-card' }, this.head);
    this.element = el('section', { class: 'sa-screen sa-qwrap' }, this.card);
    this.build(delay);
  }

  /** Another step: the current content fades out first (a step chosen again mid-fade cancels it). */
  setStep(step: number) {
    this.step = step;
    const out = step !== this.shown;
    this.label.classList.toggle('is-out', out);
    this.body.element.classList.toggle('is-out', out);
    clearTimeout(this.timer);
    if (!out) return;
    const from = this.card.getBoundingClientRect().height;
    this.timer = window.setTimeout(() => this.swap(from), OUT_MS);
  }

  refresh() {
    this.body.refresh();
  }

  leave() {
    clearTimeout(this.timer);
    this.element.classList.add('is-leaving');
  }

  private swap(from: number) {
    this.shown = this.step;
    this.build(STEP_DELAY);
    const card = this.card;
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
    setTimeout(reset, 700);
  }

  private build(delay: number) {
    const step = STEPS[this.shown];
    this.element.classList.toggle('sa-form', step.kind === 'form');
    this.label = el(
      'span',
      { 'data-sa-in': true, style: cascade(delay)() },
      `Step ${this.shown + 1} of ${STEPS.length}`,
    );
    this.head.replaceChildren(this.label);
    this.body?.element.remove();
    this.body = step.kind === 'form' ? this.contactBody(step, delay) : this.optionsBody(step, delay);
    this.card.append(this.body.element);
    this.body.refresh();
    revealSoon(this.label, this.body.element);
  }

  private optionsBody(step: Exclude<Step, { kind: 'form' }>, delay: number): Body {
    const { ctx } = this;
    const next = cascade(delay);
    const multi = step.kind === 'multi';
    const whyId = `sa-why-${this.shown}`;

    const whyButton = el(
      'button',
      { class: 'sa-why__btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': whyId },
      el('img', {
        class: 'sa-why__icon',
        src: ctx.whyIcon,
        alt: '',
        width: 16,
        height: 16,
        loading: 'lazy',
        decoding: 'async',
      }),
      'Why we ask',
    );
    const why = el(
      'div',
      { class: 'sa-why', 'data-sa-in': true, style: next() },
      whyButton,
      el('div', { class: 'sa-why__panel', id: whyId }, el('p', {}, step.why)),
    );
    whyButton.addEventListener('click', () => {
      const open = why.classList.toggle('is-open');
      whyButton.setAttribute('aria-expanded', String(open));
    });

    const options = step.options.map((option, k) => {
      const choice = el(
        'button',
        { class: 'sa-opt', type: 'button', role: multi ? 'checkbox' : 'radio', 'aria-checked': 'false' },
        el('span', { class: 'sa-opt__key', 'aria-hidden': 'true' }, LETTERS[k]),
        el('span', {}, option.label),
      );
      choice.addEventListener('click', () => ctx.onChoose(k));
      return { option, choice, item: el('li', { 'data-sa-in': true, style: next() }, choice) };
    });

    const continueButton = button('primary', 'Continue', ctx.onNext, { arrow: icon(ctx.root, 'arrow') });
    const element = el(
      'div',
      { class: 'sa-card__body' },
      el('h2', { class: 'sa-q__title', 'data-sa-in': true, style: next() }, step.title),
      el('p', { class: 'sa-q__sub', 'data-sa-in': true, style: next() }, step.sub),
      why,
      el(
        'ul',
        { class: 'sa-opts', role: multi ? 'group' : 'radiogroup', 'aria-label': step.title },
        ...options.map(({ item }) => item),
      ),
      el(
        'div',
        { class: 'sa-nav', 'data-sa-in': true, style: next() },
        button('ghost', 'Back', ctx.onBack),
        continueButton,
      ),
      el('p', { class: 'sa-hint', 'data-sa-in': true, style: next() }, 'PRESS a letter to choose, ENTER to continue.'),
    );

    return {
      element,
      refresh: () => {
        const answers = ctx.answers();
        const value = answers[step.key];
        for (const { option, choice } of options) {
          const selected = Array.isArray(value) ? value.includes(option.key) : value === option.key;
          choice.setAttribute('aria-checked', String(selected));
        }
        continueButton.disabled = !isAnswered(answers, step.key);
      },
    };
  }

  private contactBody(step: Extract<Step, { kind: 'form' }>, delay: number): Body {
    const { ctx } = this;
    const next = cascade(delay);
    const answers = ctx.answers();

    const name = el('input', {
      class: 'sa-field__input',
      id: 'sa-name',
      name: 'name',
      autocomplete: 'given-name',
    });
    name.value = answers.name;
    const email = el('input', {
      class: 'sa-field__input',
      id: 'sa-email',
      name: 'email',
      type: 'email',
      inputmode: 'email',
      autocomplete: 'email',
    });
    email.value = answers.email;
    const consent = el('input', { type: 'checkbox', name: 'consent' });
    consent.checked = answers.consent;

    const errorText = el('span');
    const error = el('p', { class: 'sa-err', role: 'alert', hidden: true }, icon(ctx.root, 'error'), errorText);
    const emailField = el(
      'div',
      { class: 'sa-field', 'data-sa-in': true },
      el('label', { class: 'sa-field__label', for: 'sa-email' }, 'Email'),
      email,
      error,
    );
    const showError = (shown: boolean) => {
      emailField.classList.toggle('is-error', shown);
      error.hidden = !shown;
      errorText.textContent = shown ? ERROR_EMAIL : '';
    };

    // The reading is sent to them: a name and a valid email are required.
    const complete = () => {
      const a = ctx.answers();
      return Boolean(a.name.trim()) && EMAIL.test(a.email.trim());
    };
    const submit = () => {
      const value = ctx.answers().email.trim();
      showError(Boolean(value) && !EMAIL.test(value));
      if (complete()) ctx.onSubmit();
    };

    name.addEventListener('input', () => ctx.onField('name', name.value));
    email.addEventListener('input', () => {
      ctx.onField('email', email.value);
      if (EMAIL.test(email.value.trim())) showError(false);
    });
    email.addEventListener('blur', () => {
      const value = email.value.trim();
      showError(Boolean(value) && !EMAIL.test(value));
    });
    for (const input of [name, email]) {
      input.addEventListener('keydown', (event) => event.key === 'Enter' && submit());
    }
    consent.addEventListener('change', () => ctx.onField('consent', consent.checked));

    const privacy = el('a', { href: ctx.consent.url, 'data-page-link': true }, ctx.consent.link);
    const seeReading = button('blue', 'See my reading', submit);
    // The delays follow the render order: title, subtitle, name, email, …
    const title = el('h2', { class: 'sa-q__title', 'data-sa-in': true, style: next() }, step.title);
    const sub = el('p', { class: 'sa-q__sub', 'data-sa-in': true, style: next() }, step.sub);
    const fieldStyle = next();
    emailField.style.cssText = next();
    const element = el(
      'div',
      { class: 'sa-card__body' },
      title,
      sub,
      el(
        'div',
        { class: 'sa-field', 'data-sa-in': true, style: fieldStyle },
        el('label', { class: 'sa-field__label', for: 'sa-name' }, 'Your name'),
        name,
      ),
      emailField,
      el(
        'label',
        { class: 'sa-consent', 'data-sa-in': true, style: next() },
        consent,
        el('span', {}, `${ctx.consent.text} `, privacy),
      ),
      el(
        'p',
        { class: 'sa-form__info', 'data-sa-in': true, style: next() },
        'We only use your email for your reading and the reminders you choose.',
        el('br'),
        'You can unsubscribe at any time.',
      ),
      el(
        'div',
        { class: 'sa-nav', 'data-sa-in': true, style: next() },
        button('ghost', 'Back', ctx.onBack),
        seeReading,
      ),
    );
    return { element, refresh: () => (seeReading.disabled = !complete()) };
  }
}
