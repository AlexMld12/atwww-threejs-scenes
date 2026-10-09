'use client';

import Image from 'next/image';
import { useEffect, useRef, type RefObject } from 'react';
import { clamp01, designScale, easeInOutCubic, easeOutCubic, isMobile, lerp, mobileUnit } from '@/lib/math';
import { cx } from '@/lib/css';
import { useFrame } from '@/lib/scroll';
import type { ProductName } from '@/scene/product-config';
import { useProductStage } from './use-product-stage';

/**
 * Centre offset from the screen centre (design px) and in-plane angle (deg). On 07 the product hangs
 * under the form (`y` is then the gap from the form's bottom to the product's centre) and rises with it.
 */
const POSES = {
  join: { x: -5.85, y: 380, angle: 10.03 },
  middle: { x: -8.7, y: -6, angle: -15 },
  footer: { x: -10.85, y: -56.15, angle: 10.03 },
};
// Phones: under the form on 07, centred on 08, over the footer's title on 09 (mobile design px).
const MOBILE_POSES = {
  join: { x: 0, y: 235, angle: 10.03 },
  middle: { x: 0, y: 0, angle: -15 },
  footer: { x: 0, y: 40, angle: 10.03 },
};
const MODELS: ProductName[] = ['K1_COOL_Foam'];
/** Share of section 7's pinned scroll at which the product starts rising from below the screen. */
const APPEAR_AT = 0.3;
/** Turns it makes while it rises to under the form. */
const APPEAR_TURNS = 1;
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
  const spinRef = useRef<HTMLDivElement>(null);
  const { canvasRef, ready, draw } = useProductStage(MODELS, 'travel-compile');
  const state = useRef({ ctaOff: false, fade: 1, form: null as Element | null });

  useEffect(() => {
    const root = document.documentElement;
    return () => root.classList.remove('cta-off');
  }, []);

  useFrame(() => {
    const el = ref.current;
    const j = join.current?.getBoundingClientRect();
    const z = zone.current?.getBoundingClientRect();
    const f = footer.current?.getBoundingClientRect();
    if (!el || !j || !z || !f) return;
    const s = state.current;
    const root = document.documentElement;
    const vh = window.innerHeight;
    const y = window.scrollY;

    const pinned = j.height - vh;
    const pin = pinned > 0 ? clamp01(-j.top / pinned) : 0;
    const shown = pin > APPEAR_AT;
    // Scrubbed by the scroll: it rises from below the screen to under the form, turning.
    const rise = easeOutCubic(clamp01((pin - APPEAR_AT) / (1 - APPEAR_AT)));

    const mobile = isMobile();
    const poses = mobile ? MOBILE_POSES : POSES;
    const start = y + j.bottom - vh;
    const middle = y + z.top + z.height / 2 - vh / 2;
    const end = y + f.top;
    const scale = mobile ? mobileUnit() : designScale();
    const form = (s.form ??= join.current?.querySelector('.join__form') ?? null)?.getBoundingClientRect();
    const below = (vh / 2 + el.offsetHeight / 2) / scale;
    const underForm = { ...poses.join, y: (form ? form.bottom - vh / 2 : 0) / scale + poses.join.y };
    underForm.y = lerp(Math.max(below, underForm.y), underForm.y, rise);
    let from = underForm;
    let to = underForm;
    let t = 0;
    let turns = -APPEAR_TURNS * (1 - rise);
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
    el.style.setProperty('--tp-x', `${(lerp(from.x, to.x, t) * scale).toFixed(2)}px`);
    // It never rises above the form while the form is still on screen.
    const ty = y > middle ? lerp(from.y, to.y, t) : Math.max(lerp(from.y, to.y, t), underForm.y);
    el.style.setProperty('--tp-y', `${(ty * scale - past).toFixed(2)}px`);
    const angle = lerp(from.angle, to.angle, t);
    if (!ready) {
      el.style.setProperty('--tp-a', `${angle.toFixed(3)}deg`);
      spinRef.current?.style.setProperty('--tp-spin', `${(turns * 360).toFixed(2)}deg`);
    } else if (shown && fade > 0) {
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
      <div className={cx('tp-reveal', ready && 'is-3d')}>
        <canvas ref={canvasRef} className="tp-canvas" />
        <div ref={spinRef} className="tp-spin">
          <Image className="tp-face" src="/images/product-1.webp" alt="" width={1024} height={1024} />
          <Image className="tp-face tp-face--back" src="/images/product-1.webp" alt="" width={1024} height={1024} />
        </div>
      </div>
    </div>
  );
}
