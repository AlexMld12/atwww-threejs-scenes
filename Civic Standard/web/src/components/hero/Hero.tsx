'use client';

import { useEffect, useRef } from 'react';
import { handOver, onLoaded, sceneIn } from '@/lib/intro';
import { finishAll } from '@/lib/preload';
import { HERO } from '@/scene/config';

// Until the scene measures it: the tube's screens, the photo's growth and the screen on the full photo.
const HERO_SCREENS = HERO.tubeScreens + HERO.growScreens + 1;

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import('@/scene/hero-scene')
      .then(({ createHeroScene }) =>
        createHeroScene(canvas.current!, getComputedStyle(document.documentElement).getPropertyValue('--paper'), (px) =>
          section.current?.style.setProperty('height', `${Math.round(px)}px`),
        ),
      )
      .then((cleanup) => {
        if (cancelled) cleanup();
        else dispose = cleanup;
      })
      .catch((error) => {
        console.error(error);
        finishAll();
        onLoaded(() => {
          handOver();
          sceneIn();
        });
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <section ref={section} className="hero" style={{ height: `calc(${HERO_SCREENS} * var(--stage-h))` }}>
      <div className="hero__stage">
        <canvas ref={canvas} className="hero__canvas" />
      </div>
    </section>
  );
}
