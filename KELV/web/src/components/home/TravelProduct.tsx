'use client';

import Image from 'next/image';
import { useEffect, useRef, type RefObject } from 'react';
import { clamp01, designScale, easeInOutCubic, isMobile, lerp, mobileUnit } from '@/lib/math';
import { cx } from '@/lib/css';
import { useFrame } from '@/lib/scroll';
import type { ProductName } from '@/scene/product-config';
import { useProductStage } from './use-product-stage';

/** Poses from the Figma frames: centre offset from the screen centre (design px), in-plane angle (deg). */
const POSES = {
  join: { x: -5.85, y: 0.85, angle: 10.03 },
  middle: { x: -8.7, y: -6, angle: -15 },
  footer: { x: -10.85, y: -56.15, angle: 10.03 },
};
// Phones: under the form on 07, centred on 08, over the footer's title on 09 (mobile design px).
const MOBILE_POSES = {
  join: { x: 0, y: 250, angle: 10.03 },
  middle: { x: 0, y: 0, angle: -15 },
  footer: { x: 0, y: 40, angle: 10.03 },
};
const MODELS: ProductName[] = ['K1_COOL_Foam'];
/** Share of section 7's pinned scroll before the product appears, so it does not cover the form. */
const APPEAR_AT = 0.6;
/** Screen share over which the product fades out once the footer starts leaving. */
const FADE_OUT = 0.45;

interface TravelProductProps {
  join: RefObject<HTMLElement | null>;
  zone: RefObject<HTMLElement | null>;
  footer: RefObject<HTMLElement | null>;
}

/** Appears on 07, turns through 08 and lands in the footer, one full turn per stage. */
export function TravelProduct({ join, zone, footer }: TravelProductProps) {
  const ref = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const { canvasRef, ready, draw } = useProductStage(MODELS, 'travel-compile');
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

    const mobile = isMobile();
    const poses = mobile ? MOBILE_POSES : POSES;
    const start = y + j.bottom - vh;
    const middle = y + z.top + z.height / 2 - vh / 2;
    const end = y + f.top;
    let from = poses.join;
    let to = poses.join;
    let t = 0;
    let turns = 0;
    if (y > start && y <= middle) {
      to = poses.middle;
      t = easeInOutCubic(clamp01((y - start) / (middle - start)));
      turns = t;
    } else if (y > middle) {
      from = poses.middle;
      to = poses.footer;
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
    const scale = mobile ? mobileUnit() : designScale();
    el.style.setProperty('--tp-x', `${(lerp(from.x, to.x, t) * scale).toFixed(2)}px`);
    el.style.setProperty('--tp-y', `${(lerp(from.y, to.y, t) * scale - past).toFixed(2)}px`);
    const angle = lerp(from.angle, to.angle, t);
    if (!ready) {
      el.style.setProperty('--tp-a', `${angle.toFixed(3)}deg`);
      spinRef.current?.style.setProperty('--tp-spin', `${(turns * 360).toFixed(2)}deg`);
    } else if (s.shown && fade > 0) {
      el.style.removeProperty('--tp-a');
      // Rolled in 3D, not by CSS: a rotated canvas would be resampled.
      draw('K1_COOL_Foam', { spin: turns * Math.PI * 2, tiltX: 0, tiltY: 0, roll: (angle * Math.PI) / 180 });
    }

    // The footer frame has no CTAs.
    const ctaOff = f.top < vh * 0.5 && f.bottom > vh * 0.5;
    if (ctaOff !== s.ctaOff) {
      s.ctaOff = ctaOff;
      root.classList.toggle('cta-off', ctaOff);
    }
  });

  return (
    <div ref={ref} className="travel-product" aria-hidden="true">
      <div ref={revealRef} className={cx('tp-reveal', ready && 'is-3d')}>
        <canvas ref={canvasRef} className="tp-canvas" />
        <div ref={spinRef} className="tp-spin">
          <Image className="tp-face" src="/images/product-1.webp" alt="" width={1024} height={1024} />
          <Image className="tp-face tp-face--back" src="/images/product-1.webp" alt="" width={1024} height={1024} />
        </div>
      </div>
    </div>
  );
}
