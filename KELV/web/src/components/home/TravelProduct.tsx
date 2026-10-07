'use client';

import Image from 'next/image';
import { useEffect, useRef, type RefObject } from 'react';
import { clamp01, designScale, easeInOutCubic, lerp } from '@/lib/math';
import { useFrame } from '@/lib/scroll';

/** Poses from the Figma frames: centre offset from the screen centre (design px), in-plane angle. */
const POSES = {
  join: { x: -5.85, y: 0.85, angle: 10.03 },
  middle: { x: -8.7, y: -6, angle: -15 },
  footer: { x: -10.85, y: -56.15, angle: 10.03 },
};
/** Share of section 7's pinned scroll before the product appears, so it does not cover the form. */
const APPEAR_AT = 0.6;
/** Screen share over which the product fades out once the footer starts leaving. */
const FADE_OUT = 0.45;

interface TravelProductProps {
  join: RefObject<HTMLElement | null>;
  zone: RefObject<HTMLElement | null>;
  footer: RefObject<HTMLElement | null>;
}

/**
 * The product that appears on section 7, turns through zone 8 and lands in the footer,
 * one turn per stage. Both faces carry the same image, so whole turns end where they began.
 */
export function TravelProduct({ join, zone, footer }: TravelProductProps) {
  const ref = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const state = useRef({ shown: false, ctaOff: false, lastY: 0, fade: 1 });

  useEffect(() => {
    const root = document.documentElement;
    return () => root.classList.remove('cta-off');
  }, []);

  useFrame(() => {
    const el = ref.current;
    const reveal = revealRef.current;
    const j = join.current?.getBoundingClientRect();
    const z = zone.current?.getBoundingClientRect();
    const f = footer.current?.getBoundingClientRect();
    if (!el || !reveal || !j || !z || !f) return;
    const s = state.current;
    const root = document.documentElement;
    const vh = window.innerHeight;
    const y = window.scrollY;
    const jumped = Math.abs(y - s.lastY) > vh * 0.5;
    s.lastY = y;

    const pinned = j.height - vh;
    const show = (pinned > 0 ? clamp01(-j.top / pinned) : 0) >= APPEAR_AT;
    if (show !== s.shown) {
      s.shown = show;
      // A jump (the loop, a scrollTo) sets the state directly instead of playing the intro.
      const instant = jumped || !root.classList.contains('is-ready');
      if (instant) reveal.style.transition = 'none';
      reveal.classList.toggle('is-in', show);
      if (instant) {
        void reveal.offsetWidth;
        reveal.style.transition = '';
      }
    }

    const start = y + j.bottom - vh;
    const middle = y + z.top + z.height / 2 - vh / 2;
    const end = y + f.top;
    let from = POSES.join;
    let to = POSES.join;
    let t = 0;
    let turns = 0;
    if (y > start && y <= middle) {
      to = POSES.middle;
      t = easeInOutCubic(clamp01((y - start) / (middle - start)));
      turns = t;
    } else if (y > middle) {
      from = POSES.middle;
      to = POSES.footer;
      t = easeInOutCubic(clamp01((y - middle) / (end - middle)));
      turns = 1 + t;
    }

    // Past the footer it travels up with it and fades before reaching the hero copy.
    const past = Math.max(0, y - end);
    const fade = 1 - easeInOutCubic(clamp01(past / (vh * FADE_OUT)));
    if (fade !== s.fade) {
      s.fade = fade;
      el.style.opacity = fade < 1 ? fade.toFixed(3) : '';
    }
    const scale = designScale();
    el.style.setProperty('--tp-x', `${(lerp(from.x, to.x, t) * scale).toFixed(2)}px`);
    el.style.setProperty('--tp-y', `${(lerp(from.y, to.y, t) * scale - past).toFixed(2)}px`);
    el.style.setProperty('--tp-a', `${lerp(from.angle, to.angle, t).toFixed(3)}deg`);
    spinRef.current?.style.setProperty('--tp-spin', `${(turns * 360).toFixed(2)}deg`);

    // The footer frame has no CTAs.
    const ctaOff = f.top < vh * 0.5 && f.bottom > vh * 0.5;
    if (ctaOff !== s.ctaOff) {
      s.ctaOff = ctaOff;
      root.classList.toggle('cta-off', ctaOff);
    }
  });

  return (
    <div ref={ref} className="travel-product" aria-hidden="true">
      <div ref={revealRef} className="tp-reveal">
        <div ref={spinRef} className="tp-spin">
          <Image className="tp-face" src="/images/product-1.webp" alt="" width={1024} height={1024} />
          <Image className="tp-face tp-face--back" src="/images/product-1.webp" alt="" width={1024} height={1024} />
        </div>
      </div>
    </div>
  );
}
