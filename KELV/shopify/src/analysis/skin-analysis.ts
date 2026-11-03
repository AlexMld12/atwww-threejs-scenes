import { postCustomerForm } from '@/lib/customer-form';
import { KelvElement } from '@/lib/element';
import { getLenis } from '@/lib/scroll';
import { cascade, revealSoon } from './dom';
import { LiveReading } from './live-reading';
import { STAGES, STEPS, calibrated, emptyAnswers, formatReading, isAnswered, plan, skinReading } from './logic';
import type { Answers } from './logic';
import { LETTERS, OUT_MS, QuestionCard, type Field, type QuizContext } from './question-card';
import { Report } from './report';
import { StageTicks } from './stage-ticks';

type Screen = 'start' | number | 'report';

interface View {
  element: HTMLElement;
  leave(): void;
  dispose?(): void;
}

interface CartItem {
  id: number;
  selling_plan: number | null;
}

const isQuestion = (screen: Screen): screen is number => typeof screen === 'number';

/**
 * /pages/skin-analysis: the start screen, seven questions on one card and the report. The answers live here, so
 * they survive the layer sliding away and back; each entrance plays the current screen in again.
 */
export class SkinAnalysis extends KelvElement {
  private answers: Answers = emptyAnswers();
  private screen: Screen = 'start';
  private done = new Set<number>();
  private views: { view: View; leaving: boolean }[] = [];
  private card: QuestionCard | null = null;
  private instant = true;
  private ticks!: StageTicks;
  private live!: LiveReading;
  private body!: HTMLElement;
  private ctx!: QuizContext;

  protected mount() {
    this.body = this.ref('body')!;
    this.ticks = new StageTicks(this.ref('stages')!);
    this.live = new LiveReading(this.ref('live')!);
    this.ctx = {
      root: this,
      whyIcon: this.dataset.whyIcon!,
      consent: {
        text: this.dataset.consentText ?? '',
        link: this.dataset.consentLink ?? '',
        url: this.dataset.consentUrl!,
      },
      answers: () => this.answers,
      onChoose: (option) => this.choose(option),
      onField: (field, value) => this.setField(field, value),
      onBack: () => this.back(),
      onNext: () => this.advance(),
      onSubmit: () => this.submit(),
    };
    this.cleanup(() => {
      this.clearViews();
      this.ticks.dispose();
      this.live.dispose();
    });

    this.enter(0);
    const panel = this.closest('.page-layer');
    if (panel) {
      this.listen(panel, 'kelv:layer-enter', (event) =>
        this.enter((event as CustomEvent<{ delay: number }>).detail.delay),
      );
    }
    this.listen(window, 'resize', () => this.ticks.measure());
    this.listen(document, 'keydown', (event) => this.onKey(event as KeyboardEvent));
  }

  /** The current screen comes in again (the layer slid in), `delay` seconds from now. */
  private enter(delay: number) {
    this.clearViews();
    this.card = null;
    this.instant = true;
    this.add(this.screen, delay);
    this.ticks.measure();
    this.update();
  }

  private go(next: Screen) {
    this.instant = false;
    if (isQuestion(this.screen) && isQuestion(next) && this.card) {
      this.card.setStep(next);
    } else {
      for (const entry of this.views) {
        entry.view.leave();
        entry.leaving = true;
      }
      this.card = null;
      this.add(next, OUT_MS / 1000);
      setTimeout(() => this.removeLeaving(), OUT_MS + 80);
    }
    this.screen = next;
    if (window.scrollY > 0) getLenis()?.scrollTo(0, { duration: 0.8 });
    this.update();
  }

  private add(screen: Screen, delay: number) {
    const view = this.createView(screen, delay);
    this.views.push({ view, leaving: false });
    this.body.append(view.element);
  }

  private createView(screen: Screen, delay: number): View {
    if (screen === 'start') return this.startView(delay);
    if (screen === 'report') {
      return new Report(this.answers, delay, {
        kitIcon: this.dataset.kitIcon!,
        onCart: (extra) => this.addToCart(extra),
        onRetake: () => this.retake(),
      });
    }
    this.card = new QuestionCard(this.ctx, screen, delay);
    return this.card;
  }

  /** The start screen is the section's own markup (its texts are set in the theme editor). */
  private startView(delay: number): View {
    const template = this.querySelector<HTMLTemplateElement>('template[data-part="start"]')!;
    const element = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const next = cascade(delay);
    for (const item of element.querySelectorAll<HTMLElement>('[data-sa-in]')) item.style.cssText = next();
    element.querySelector('[data-action="start"]')?.addEventListener('click', () => this.go(0));
    revealSoon(element);
    return { element, leave: () => element.classList.add('is-leaving') };
  }

  private removeLeaving() {
    this.views = this.views.filter(({ view, leaving }) => {
      if (!leaving) return true;
      view.dispose?.();
      view.element.remove();
      return false;
    });
  }

  private clearViews() {
    for (const { view } of this.views) {
      view.dispose?.();
      view.element.remove();
    }
    this.views = [];
  }

  private choose(option: number) {
    if (!isQuestion(this.screen)) return;
    const step = STEPS[this.screen];
    if (step.kind === 'form') return;
    const picked = step.options[option];
    if (!picked) return;
    this.instant = false;
    if (step.kind === 'single') {
      this.answers = { ...this.answers, [step.key]: picked.key };
    } else {
      const set = new Set(this.answers[step.key]);
      if (set.has(picked.key)) set.delete(picked.key);
      else {
        if (picked.exclusive) set.clear();
        else for (const o of step.options) if (o.exclusive) set.delete(o.key);
        set.add(picked.key);
      }
      // Option order, not click order: the kit ID depends on it.
      this.answers = { ...this.answers, [step.key]: step.options.filter((o) => set.has(o.key)).map((o) => o.key) };
    }
    this.update();
  }

  private setField(field: Field, value: string | boolean) {
    this.answers = { ...this.answers, [field]: value };
    this.update();
  }

  private advance() {
    const screen = this.screen;
    if (!isQuestion(screen) || !isAnswered(this.answers, STEPS[screen].key)) return;
    this.done.add(screen);
    this.go(screen + 1);
  }

  private back() {
    if (isQuestion(this.screen)) this.go(this.screen === 0 ? 'start' : this.screen - 1);
  }

  private submit() {
    if (!isQuestion(this.screen)) return;
    this.done.add(this.screen);
    if (this.answers.consent) this.saveContact();
    this.go('report');
  }

  /**
   * With the box ticked, the name and email become a customer in the admin who accepts emails (Shopify's customer
   * form), tagged with the reading's kit ID. Posted in the background; Shopify's captcha, when it asks for one, takes the page to it.
   */
  private saveContact() {
    const form = this.ref<HTMLFormElement>('contact-form');
    if (!form) return;
    const set = (name: string, value: string) => ((form.elements.namedItem(name) as HTMLInputElement).value = value);
    set('contact[email]', this.answers.email.trim());
    set('contact[first_name]', this.answers.name.trim());
    set('contact[tags]', `skin-analysis, ${plan(this.answers).kitId}`);
    postCustomerForm(form).catch((error: unknown) => console.warn('[skin analysis]', error));
  }

  private retake() {
    this.answers = emptyAnswers();
    this.done.clear();
    this.go('start');
  }

  /** The card, the stage bars (half a step once answered, a full one after Continue) and the live reading. */
  private update() {
    const { screen, answers } = this;
    this.card?.refresh();
    const unit = (i: number) => {
      if (screen === 'report') return 1;
      if (i === STEPS.length) return 0;
      if (this.done.has(i)) return 1;
      return i === screen && isAnswered(answers, STEPS[i].key) ? 0.5 : 0;
    };
    const progress = STAGES.map((stage) => stage.units.reduce((sum, i) => sum + unit(i), 0) / stage.units.length);
    const active =
      screen === 'start'
        ? -1
        : screen === 'report'
          ? STAGES.length - 1
          : STAGES.findIndex((s) => s.units.includes(screen));
    this.ticks.update(progress, active, this.instant);
    this.live.set(skinReading(answers));
  }

  /** A letter picks an option, ENTER continues. */
  private onKey(event: KeyboardEvent) {
    const html = document.documentElement;
    if (html.dataset.page !== 'sa' || html.classList.contains('layer-anim')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea')) return;
    const screen = this.screen;
    if (event.key === 'Enter') {
      if (target.matches('button, a')) return;
      if (screen === 'start') this.go(0);
      else if (isQuestion(screen) && STEPS[screen].kind !== 'form') this.advance();
      return;
    }
    if (!isQuestion(screen)) return;
    const step = STEPS[screen];
    const index = LETTERS.indexOf(event.key.toUpperCase());
    if (step.kind !== 'form' && event.key.length === 1 && index >= 0 && index < step.options.length) {
      event.preventDefault();
      this.choose(index);
    }
  }

  /**
   * The kit (or K2 alone) goes to the cart drawer with the reading as line properties (the quiz document);
   * `_` properties stay out of the checkout. A refill uses the product's first selling plan, when it has one.
   */
  private addToCart({ subscription, product = 'kit' }: { subscription: boolean; product?: 'kit' | 'k2' }) {
    const kit: { kit: CartItem[]; k2: CartItem | null } = JSON.parse(this.ref('kit')?.textContent ?? '{}');
    const chosen = product === 'k2' ? (kit.k2 ? [kit.k2] : []) : (kit.kit ?? []);
    if (!chosen.length) return;
    const result = plan(this.answers);
    const { type, sens, heat, signs, routine, goal } = this.answers;
    const properties = {
      'Skin reading': `${formatReading(result.reading)}°C`,
      'Kit ID': result.kitId,
      Calibrated: calibrated(),
      Profile: result.profile,
      _k2_schedule: result.k2,
      _answers: JSON.stringify({ type, sens, heat, signs, routine, goal }),
    };
    const items = chosen.map(({ id, selling_plan }) => ({
      id,
      quantity: 1,
      properties,
      ...(subscription && selling_plan ? { selling_plan } : {}),
    }));
    document.dispatchEvent(new CustomEvent('kelv:add-to-cart', { detail: { items } }));
  }
}
