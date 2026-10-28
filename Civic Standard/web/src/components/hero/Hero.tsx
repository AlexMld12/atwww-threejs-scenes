'use client';

import { useEffect, useRef } from 'react';
import { handOver, onLoaded, sceneIn } from '@/lib/intro';
import { finishAll } from '@/lib/preload';
import { HERO, SCROLL } from '@/scene/config';

// Until the scene measures it: the tube's travel (at Figma's 850 px), the photo's growth and the screen on the full photo.
const HERO_SCREENS = HERO.minTravel / SCROLL.travelPerPx / 850 + HERO.growScreens + 1;

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import('@/scene/hero-scene')
      .then(({ createHeroScene }) =>
        createHeroScene(canvas.current!, getComputedStyle(document.documentElement).getPropertyValue('--paper'), {
          mode: 'home',
          onHeroHeight: (px) => section.current?.style.setProperty('height', `${Math.round(px)}px`),
        }),
      )
      .then((scene) => {
        if (cancelled) scene.dispose();
        else dispose = scene.dispose;
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
