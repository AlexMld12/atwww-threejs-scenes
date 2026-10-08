'use client';

import Lenis from 'lenis';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type FrameCallback = (now: number) => void;

interface ScrollContextValue {
  lenis: Lenis | null;
  /** Turns the footer → hero wrap-around on or off (off while the analysis is the page). */
  setLoop: (enabled: boolean) => void;
  /** True once fonts are in and the hidden first frame has been painted: the preloader can start. */
  booted: boolean;
  /** True once the page is revealed (the preloader leaving): reveals and the hero intro start. */
  ready: boolean;
  reveal: () => void;
  subscribe: (callback: FrameCallback) => () => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

const FONT_TIMEOUT_MS = 2000;

export function ScrollProvider({ children }: { children: ReactNode }) {
  const callbacks = useRef(new Set<FrameCallback>());
  const lenisRef = useRef<Lenis | null>(null);
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const [booted, setBooted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Same options as drinksom.eu; `infinite` drives the footer → hero loop.
    const instance = new Lenis({
      lerp: 0.14,
      smoothWheel: true,
      infinite: true,
      syncTouch: true,
      syncTouchLerp: 0.1,
      touchMultiplier: 1,
    });
    lenisRef.current = instance;
    setLenis(instance);

    let frame = requestAnimationFrame(function tick(now) {
      instance.raf(now);
      for (const callback of callbacks.current) callback(now);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      instance.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
    Promise.race([document.fonts.ready, timeout]).then(() => {
      if (cancelled) return;
      document.documentElement.classList.add('is-ready');
      // Two frames later, so the hidden state is painted before it changes.
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setBooted(true)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback((callback: FrameCallback) => {
    const set = callbacks.current;
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  }, []);

  const setLoop = useCallback((enabled: boolean) => {
    if (lenisRef.current) lenisRef.current.options.infinite = enabled;
  }, []);

  const reveal = useCallback(() => setReady(true), []);

  const value = useMemo(
    () => ({ lenis, setLoop, booted, ready, reveal, subscribe }),
    [lenis, setLoop, booted, ready, reveal, subscribe],
  );
  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}

export function useScroll() {
  const context = useContext(ScrollContext);
  if (!context) throw new Error('useScroll must be used inside <ScrollProvider>');
  return context;
}

/** Runs `callback` on every animation frame, after Lenis has updated the scroll position. */
export function useFrame(callback: FrameCallback) {
  const { subscribe } = useScroll();
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => subscribe((now) => latest.current(now)), [subscribe]);
}
