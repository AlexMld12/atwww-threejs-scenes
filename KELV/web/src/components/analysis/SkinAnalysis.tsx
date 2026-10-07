'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Logo } from '@/components/ui/icons';
import { easeOutCubic, prefersReducedMotion } from '@/lib/math';
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
import { LETTERS, OUT_MS, QuestionCard } from './QuestionCard';
import { ReportScreen } from './ReportScreen';
import { StageTicks } from './StageTicks';
import { StartScreen } from './StartScreen';

const PATH = '/skin-analysis';
const TRANSITION_MS = 1000;
const TRANSITION_EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
const SCRIM_OPACITY = 0.7;
const ENTER_DELAY = 0.4;
const DIRECT_ENTRY_DELAY = 0.1;
const LIVE_COUNT_MS = 450;

type Screen = 'start' | number | 'report';
interface View {
  id: number;
  screen: Screen;
  delay: number;
  leaving: boolean;
}

const isQuestion = (screen: Screen): screen is number => typeof screen === 'number';

/**
 * /skin-analysis, opened from OPEN SHOP. It lives in the same document as the home page, so
 * the transition is continuous and the home keeps its scroll position, Lenis and 3D scene:
 * the panel slides up over the home (clip-path), then becomes the page (`html.sa-on`).
 * Back in the browser plays it in reverse.
 */
export function SkinAnalysis() {
  const pathname = usePathname();
  const router = useRouter();
  const { lenis, setLoop, ready } = useScroll();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const wantsOpen = pathname === PATH;

  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [screen, setScreen] = useState<Screen>('start');
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set());
  const [views, setViews] = useState<View[]>([{ id: 0, screen: 'start', delay: 0, leaving: false }]);
  const [entry, setEntry] = useState(0);
  const [instantProgress, setInstantProgress] = useState(true);

  // ---- route transition ----
  const route = useRef({ open: false, busy: false, homeY: 0, fromHome: false, started: false });

  /** Replays the current screen's entrance after `delay` seconds (the page transition). */
  const replayEntrance = useCallback((delay: number) => {
    setEntry((key) => key + 1);
    setViews((list) => list.filter((v) => !v.leaving).map((v) => ({ ...v, delay })));
    setInstantProgress(true);
  }, []);
  const wantsOpenRef = useRef(wantsOpen);
  useEffect(() => {
    wantsOpenRef.current = wantsOpen;
  });

  const play = useCallback(async (enter: boolean) => {
    const panel = panelRef.current!;
    const scrim = scrimRef.current!;
    const clip = [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }];
    const dim = [{ opacity: 0 }, { opacity: SCRIM_OPACITY }];
    const timing = { duration: TRANSITION_MS, easing: TRANSITION_EASE, fill: 'both' as const };
    const slide = panel.animate(enter ? clip : clip.reverse(), timing);
    const fade = scrim.animate(enter ? dim : dim.reverse(), timing);
    await slide.finished.catch(() => {});
    return () => {
      slide.cancel();
      fade.cancel();
    };
  }, []);

  /** Plays transitions until the panel matches the URL (Back may be pressed mid-transition). */
  const sync = useCallback(async () => {
    const r = route.current;
    if (!lenis || r.busy) return;
    r.busy = true;
    const html = document.documentElement;
    const panel = panelRef.current!;

    while (wantsOpenRef.current !== r.open) {
      const panelY = window.scrollY;
      lenis.stop();
      html.classList.add('sa-anim');
      if (wantsOpenRef.current) {
        r.open = true;
        r.fromHome = true;
        r.homeY = window.scrollY;
        panel.scrollTop = 0;
        replayEntrance(ENTER_DELAY);
        const finish = await play(true);
        html.classList.add('sa-on');
        html.classList.remove('sa-anim');
        finish();
        setLoop(false);
        lenis.resize();
        lenis.scrollTo(0, { immediate: true, force: true });
      } else {
        r.open = false;
        // The panel becomes a fixed layer at the same content position; the home returns under it.
        panel.scrollTop = panelY;
        html.classList.remove('sa-on');
        setLoop(true);
        lenis.resize();
        lenis.scrollTo(r.homeY, { immediate: true, force: true });
        const finish = await play(false);
        html.classList.remove('sa-anim');
        finish();
      }
      lenis.start();
    }
    r.busy = false;
  }, [lenis, play, replayEntrance, setLoop]);

  useEffect(() => {
    const r = route.current;
    if (!lenis || r.started) return;
    r.started = true;
    // Direct entry: the boot script already set `sa-on`, the panel is the page.
    if (document.documentElement.classList.contains('sa-on')) {
      r.open = true;
      setLoop(false);
    }
  }, [lenis, setLoop]);

  useEffect(() => {
    if (route.current.started) sync();
  }, [wantsOpen, sync]);

  useEffect(() => {
    if (ready && route.current.open && !route.current.fromHome) {
      replayEntrance(DIRECT_ENTRY_DELAY);
    }
  }, [ready, replayEntrance]);

  const onHome = (event: MouseEvent) => {
    event.preventDefault();
    if (route.current.fromHome) router.back();
    else router.push('/', { scroll: false });
  };

  // ---- screens ----
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

  // The cart line properties the quiz document asks for, ready for Shopify's /cart/add.js.
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
      if (!html.classList.contains('sa-on') || html.classList.contains('sa-anim')) return;
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

  // ---- progress: half a step when the current step is answered, a full one after Continue ----
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
    screen === 'start' ? -1 : screen === 'report' ? STAGES.length - 1 : STAGES.findIndex((s) => s.units.includes(screen));

  const reading = useMemo(() => skinReading(answers), [answers]);

  return (
    <>
      <div ref={scrimRef} className="sa-scrim" aria-hidden="true" />
      <div ref={panelRef} className="sa" id="skin-analysis">
        <header className="sa-head">
          <Link className="sa-logo" href="/" aria-label="KELV — home" onClick={onHome}>
            <Logo degreeClassName="sa-logo__deg" />
          </Link>
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

/** LIVE READING counts to each new value. */
function LiveReading({ value }: { value: number | null }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (value === null || from.current === null || prefersReducedMotion()) {
      from.current = value;
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - start) / LIVE_COUNT_MS);
      const current = origin + (value - origin) * easeOutCubic(k);
      from.current = current;
      setShown(Math.round(current * 10) / 10);
      if (k < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="sa-live__val">{shown === null ? '––.–' : formatReading(shown)}</span>;
}
