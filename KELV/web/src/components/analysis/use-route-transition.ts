'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import { useScroll } from '@/lib/scroll';

const PATH = '/skin-analysis';
const DURATION_MS = 1000;
const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
const SCRIM_OPACITY = 0.7;
const ENTER_DELAY = 0.4;
const DIRECT_ENTRY_DELAY = 0.1;

/** Slides the panel over the home when the URL is /skin-analysis, and back; the home keeps its scroll. */
export function useRouteTransition(replayEntrance: (delay: number) => void) {
  const pathname = usePathname();
  const router = useRouter();
  const { lenis, setLoop, ready } = useScroll();
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const wantsOpen = pathname === PATH;
  const wantsOpenRef = useRef(wantsOpen);
  const route = useRef({ open: false, busy: false, homeY: 0, fromHome: false, started: false });

  useEffect(() => {
    wantsOpenRef.current = wantsOpen;
  });

  const play = useCallback(async (enter: boolean) => {
    const clip = [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }];
    const dim = [{ opacity: 0 }, { opacity: SCRIM_OPACITY }];
    const timing = { duration: DURATION_MS, easing: EASE, fill: 'both' as const };
    const slide = panel.current!.animate(enter ? clip : clip.reverse(), timing);
    const fade = scrim.current!.animate(enter ? dim : dim.reverse(), timing);
    await slide.finished.catch(() => {});
    return () => {
      slide.cancel();
      fade.cancel();
    };
  }, []);

  // Loops until the panel matches the URL: Back may be pressed mid-transition.
  const sync = useCallback(async () => {
    const r = route.current;
    if (!lenis || r.busy) return;
    r.busy = true;
    const html = document.documentElement;
    const layer = panel.current!;

    while (wantsOpenRef.current !== r.open) {
      const panelY = window.scrollY;
      lenis.stop();
      html.classList.add('sa-anim');
      if (wantsOpenRef.current) {
        r.open = true;
        r.fromHome = true;
        r.homeY = window.scrollY;
        layer.scrollTop = 0;
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
        layer.scrollTop = panelY;
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

  // Direct entry: the boot script already set `sa-on`, so the panel is the page.
  useEffect(() => {
    const r = route.current;
    if (!lenis || r.started) return;
    r.started = true;
    if (document.documentElement.classList.contains('sa-on')) {
      r.open = true;
      setLoop(false);
    }
  }, [lenis, setLoop]);

  useEffect(() => {
    if (route.current.started) sync();
  }, [wantsOpen, sync]);

  useEffect(() => {
    if (ready && route.current.open && !route.current.fromHome) replayEntrance(DIRECT_ENTRY_DELAY);
  }, [ready, replayEntrance]);

  const goHome = (event: MouseEvent) => {
    event.preventDefault();
    if (route.current.fromHome) router.back();
    else router.push('/', { scroll: false });
  };

  return { panel, scrim, goHome };
}
