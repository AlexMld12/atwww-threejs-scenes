'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Logo } from '@/components/ui/icons';
import { useScroll } from '@/lib/scroll';
import {
  STAGES,
  STEPS,
  calibrated,
  emptyAnswers,
  formatReading,
  isAnswered,
  plan,
  skinReading,
  type Answers,
} from '@/analysis/logic';
import { LiveReading } from './LiveReading';
import { LETTERS, OUT_MS, QuestionCard } from './QuestionCard';
import { ReportScreen } from './ReportScreen';
import { StageTicks } from './StageTicks';
import { StartScreen } from './StartScreen';
import { PageLink } from '@/components/layers/PageLink';
import { usePageLayer } from '@/components/layers/use-page-layer';

type Screen = 'start' | number | 'report';

interface View {
  id: number;
  screen: Screen;
  delay: number;
  leaving: boolean;
}

const isQuestion = (screen: Screen): screen is number => typeof screen === 'number';

/** /skin-analysis: lives in the same document as the home and slides over it (use-route-transition). */
export function SkinAnalysis() {
  const { lenis } = useScroll();

  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [screen, setScreen] = useState<Screen>('start');
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set());
  const [views, setViews] = useState<View[]>([{ id: 0, screen: 'start', delay: 0, leaving: false }]);
  const [entry, setEntry] = useState(0);
  const [instantProgress, setInstantProgress] = useState(true);

  const replayEntrance = useCallback((delay: number) => {
    setEntry((key) => key + 1);
    setViews((list) => list.filter((v) => !v.leaving).map((v) => ({ ...v, delay })));
    setInstantProgress(true);
  }, []);

  const panel = usePageLayer('sa', replayEntrance);

  const go = useCallback(
    (next: Screen) => {
      setInstantProgress(false);
      if (isQuestion(screen) && isQuestion(next)) {
        setViews((list) => list.map((v) => (v.leaving ? v : { ...v, screen: next })));
      } else {
        setViews((list) => {
          const id = Math.max(...list.map((v) => v.id)) + 1;
          const fresh = { id, screen: next, delay: OUT_MS / 1000, leaving: false };
          return [...list.map((v) => ({ ...v, leaving: true })), fresh];
        });
        setTimeout(() => setViews((list) => list.filter((v) => !v.leaving)), OUT_MS + 80);
      }
      setScreen(next);
      if (window.scrollY > 0) lenis?.scrollTo(0, { duration: 0.8 });
    },
    [lenis, screen],
  );

  const choose = useCallback(
    (option: number) => {
      if (!isQuestion(screen)) return;
      const step = STEPS[screen];
      if (step.kind === 'form') return;
      const picked = step.options[option];
      if (!picked) return;
      setInstantProgress(false);
      setAnswers((a) => {
        if (step.kind === 'single') return { ...a, [step.key]: picked.key };
        const set = new Set(a[step.key]);
        if (set.has(picked.key)) set.delete(picked.key);
        else {
          if (picked.exclusive) set.clear();
          else for (const o of step.options) if (o.exclusive) set.delete(o.key);
          set.add(picked.key);
        }
        // Option order, not click order: the kit ID depends on it.
        return { ...a, [step.key]: step.options.filter((o) => set.has(o.key)).map((o) => o.key) };
      });
    },
    [screen],
  );

  const advance = useCallback(() => {
    if (!isQuestion(screen) || !isAnswered(answers, STEPS[screen].key)) return;
    setDone((d) => new Set(d).add(screen));
    go(screen + 1);
  }, [answers, go, screen]);

  const back = useCallback(() => {
    if (isQuestion(screen)) go(screen === 0 ? 'start' : screen - 1);
  }, [go, screen]);

  const submit = () => {
    if (!isQuestion(screen)) return;
    setDone((d) => new Set(d).add(screen));
    go('report');
  };

  const retake = () => {
    setAnswers(emptyAnswers());
    setDone(new Set());
    go('start');
  };

  // The cart line properties from the quiz document, ready for Shopify's /cart/add.js.
  const addToCart = ({ subscription, product = 'recovery-kit' }: { subscription: boolean; product?: string }) => {
    const result = plan(answers);
    const { type, sens, heat, signs, routine, goal } = answers;
    const detail = {
      product,
      subscription,
      properties: {
        'Skin reading': `${formatReading(result.reading)}°C`,
        'Kit ID': result.kitId,
        Calibrated: calibrated(),
        Profile: result.profile,
        _k2_schedule: result.k2,
        _answers: JSON.stringify({ type, sens, heat, signs, routine, goal }),
      },
    };
    document.dispatchEvent(new CustomEvent('kelv:add-to-cart', { detail }));
  };

  // A letter picks an option, ENTER continues.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const html = document.documentElement;
      if (html.dataset.page !== 'sa' || html.classList.contains('layer-anim')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea')) return;
      if (event.key === 'Enter') {
        if (target.matches('button, a')) return;
        if (screen === 'start') go(0);
        else if (isQuestion(screen) && STEPS[screen].kind !== 'form') advance();
        return;
      }
      if (!isQuestion(screen)) return;
      const step = STEPS[screen];
      const index = LETTERS.indexOf(event.key.toUpperCase());
      if (step.kind !== 'form' && event.key.length === 1 && index >= 0 && index < step.options.length) {
        event.preventDefault();
        choose(index);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [advance, choose, go, screen]);

  // Half a step once the current step is answered, a full one after Continue.
  const progress = useMemo(() => {
    const unit = (i: number) => {
      if (screen === 'report') return 1;
      if (i === STEPS.length) return 0;
      if (done.has(i)) return 1;
      return i === screen && isAnswered(answers, STEPS[i].key) ? 0.5 : 0;
    };
    return STAGES.map((stage) => stage.units.reduce((sum, i) => sum + unit(i), 0) / stage.units.length);
  }, [answers, done, screen]);

  const activeStage =
    screen === 'start'
      ? -1
      : screen === 'report'
        ? STAGES.length - 1
        : STAGES.findIndex((s) => s.units.includes(screen));

  const reading = useMemo(() => skinReading(answers), [answers]);

  return (
    <>
      <div ref={panel} className="sa page-layer" id="skin-analysis">
        <header className="sa-head">
          <PageLink className="sa-logo" href="/" aria-label="KELV — home">
            <Logo degreeClassName="sa-logo__deg" />
          </PageLink>
          <p className="sa-title" aria-label="Skin analysis">
            <span className="sa-title__a">Skin</span>
            <span className="sa-title__b">Analysis</span>
          </p>
          <div className="sa-live" aria-live="polite">
            <span className="sa-live__label mono">Live reading</span>
            <span className="sa-live__row">
              <LiveReading value={reading} />
              <i className="sa-deg" aria-hidden="true" />
            </span>
          </div>
        </header>
        <StageTicks progress={progress} active={activeStage} measureKey={entry} instant={instantProgress} />
        <div className="sa-body" key={entry}>
          {views.map((view) => {
            const delay = view.leaving ? 0 : view.delay;
            if (view.screen === 'start') {
              return <StartScreen key={view.id} delay={delay} leaving={view.leaving} onStart={() => go(0)} />;
            }
            if (view.screen === 'report') {
              return (
                <ReportScreen
                  key={view.id}
                  answers={answers}
                  delay={delay}
                  leaving={view.leaving}
                  onCart={addToCart}
                  onRetake={retake}
                />
              );
            }
            return (
              <QuestionCard
                key={view.id}
                step={view.screen}
                answers={answers}
                delay={delay}
                leaving={view.leaving}
                onChoose={choose}
                onField={(field, value) => setAnswers((a) => ({ ...a, [field]: value }))}
                onBack={back}
                onNext={advance}
                onSubmit={submit}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
