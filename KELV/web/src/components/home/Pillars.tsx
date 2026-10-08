'use client';

import Image from 'next/image';
import { useEffect, useRef, type PointerEvent } from 'react';
import { Lines, Words } from '@/components/ui/Words';
import { designLength, designScale, clamp01, easeInOutCubic, easeInOutSine, easeOutExpo, lerp } from '@/lib/math';
import { cx, type CSSVars } from '@/lib/css';
import { useFrame } from '@/lib/scroll';
import type { ProductName } from '@/scene/product-config';
import { useProductStage } from './use-product-stage';

interface Pillar {
  a: string;
  b: string;
  accent: string;
  id: string;
  /** `y` puts the bottle's own centre on the screen's centre (design px). */
  product: { model: ProductName; img: string; y: number };
  rings: { x: number; y: number; r: number }[];
}

const PILLARS: Pillar[] = [
  {
    a: 'Mental',
    b: 'Focus',
    accent: 'var(--c-orange)',
    id: '01',
    product: { model: 'K1_COOL_Foam', img: '/images/product-1.webp', y: -12.58 },
    rings: [{ x: 209, y: 309, r: 651.5 }],
  },
  {
    a: 'Stamina',
    b: 'Boost',
    accent: 'var(--c-orange)',
    id: '02',
    product: { model: 'K2_CALM_Serum', img: '/images/product-2.webp', y: -36.11 },
    rings: [],
  },
  {
    a: 'Imune',
    b: 'Control',
    accent: 'var(--c-ink)',
    id: '03',
    product: { model: 'K3_SEAL_Cream', img: '/images/product-3.webp', y: -36.11 },
    rings: [
      { x: -193.5, y: 106.5, r: 431 },
      { x: 351, y: 283, r: 487.5 },
    ],
  },
];
const DESCRIPTION =
  'Lorem ipsum dolor sit amet consectetur. Ultricies sagittis id lorem id enim velit id sodales mauris. Augue vel mauris';
const TAGLINE = 'Three steps back to\nThree lorcsa dkjad back to baseline.';

// One scale and one centre line for all three, so they stand in the same place (the client's request).
const PRODUCT_SIZE = 805.4;
const MODELS = PILLARS.map((pillar) => pillar.product.model);
const DEG = Math.PI / 180;
const TILT_MAX = 18;
const TILT_EASE = 0.12;
const CLICK_SPIN_S = 1.2;
// One turn per transition over most of the segment, so it can be followed; the product swaps when
// the bottle passes side-on (270°), independently of the texts' swap at B = 0.5.
const SPIN_FROM = 0.1;
const SPIN_EASE = 0.1;
const RING_FADE_MS = 400;

/** 02–04 (drinksom power-pillars): everything swaps at B = 0.5, while the product is edge-on. */
export function Pillars() {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const backgroundRefs = useRef<(HTMLImageElement | null)[]>([]);
  const ringRefs = useRef<(SVGSVGElement | null)[][]>(PILLARS.map(() => []));
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleARef = useRef<HTMLSpanElement>(null);
  const titleBRef = useRef<HTMLSpanElement>(null);
  const idRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const faceRefs = useRef<(HTMLImageElement | null)[]>([]);
  const { canvasRef, ready, draw } = useProductStage(MODELS, 'pillars-compile');

  const state = useRef({
    on: false,
    visible: -1,
    shown: 0,
    ringsFor: -1,
    zoom: -1,
    tilt: { x: 0, y: 0, targetX: 0, targetY: 0 },
    spin: Number.NaN,
    clickStart: -1,
    swapTimer: 0 as number | ReturnType<typeof setTimeout>,
  });

  useEffect(() => {
    for (const p of PILLARS) {
      const image = new window.Image();
      image.src = p.product.img;
      image.decode().catch(() => {});
    }
    const s = state.current;
    return () => clearTimeout(s.swapTimer);
  }, []);

  function showRings(index: number) {
    const s = state.current;
    if (s.ringsFor === index) return;
    s.ringsFor = index;
    ringRefs.current.forEach((rings, i) => {
      for (const ring of rings) {
        if (!ring) continue;
        if (i === index) {
          ring.classList.remove('is-gone', 'is-drawn');
          ring.getBoundingClientRect();
          requestAnimationFrame(() => ring.classList.add('is-drawn'));
        } else if (ring.classList.contains('is-drawn')) {
          ring.classList.add('is-gone');
          setTimeout(() => ring.classList.contains('is-gone') && ring.classList.remove('is-drawn'), RING_FADE_MS);
        }
      }
    });
  }

  function setTitle(pillar: Pillar) {
    titleARef.current!.textContent = pillar.a;
    titleBRef.current!.textContent = pillar.b;
    titleRef.current!.style.setProperty('--pl-accent', pillar.accent);
  }

  function setStatic(index: number) {
    setTitle(PILLARS[index]);
    idRef.current!.textContent = PILLARS[index].id;
    for (const word of stickyRef.current!.querySelectorAll('.sw-in')) {
      word.classList.remove('is-out', 'is-below', 'is-enter');
    }
    state.current.shown = index;
  }

  /** Title comes back from blur in place; words slide out up, then the new ones in from below. */
  function swapTo(index: number) {
    const s = state.current;
    setTitle(PILLARS[index]);
    const titleRows = [titleARef.current!, titleBRef.current!];
    for (const row of titleRows) row.classList.add('is-swap');
    titleRef.current!.getBoundingClientRect();
    for (const row of titleRows) row.classList.remove('is-swap');

    const groups = [
      copyRef.current!.querySelector('.pillar-copy__desc')!,
      stickyRef.current!.querySelector('.pillar-tag')!,
    ];
    clearTimeout(s.swapTimer);
    let outDuration = 0;
    groups.forEach((group, g) => {
      const delay = g * 0.06;
      const parts = [...group.querySelectorAll<HTMLElement>('.sw-in')];
      parts.forEach((part, j) => {
        part.classList.remove('is-enter', 'is-below');
        part.style.transitionDelay = `${delay + 0.015 * j}s`;
        part.classList.add('is-out');
      });
      outDuration = Math.max(outDuration, delay + 0.25 + 0.015 * Math.max(0, parts.length - 1));
    });

    s.swapTimer = setTimeout(() => {
      idRef.current!.textContent = PILLARS[index].id;
      for (const group of groups) {
        const parts = [...group.querySelectorAll<HTMLElement>('.sw-in')];
        for (const part of parts) part.classList.replace('is-out', 'is-below');
        group.getBoundingClientRect();
        parts.forEach((part, j) => {
          part.style.transitionDelay = `${0.03 * j}s`;
          part.classList.replace('is-below', 'is-enter');
        });
      }
      s.shown = index;
    }, outDuration * 1000);
  }

  function setOn(on: boolean) {
    const s = state.current;
    if (on === s.on) return;
    s.on = on;
    const sticky = stickyRef.current!;
    const elements = sticky.querySelectorAll('.pl-el');
    if (on) {
      for (const el of elements) el.classList.add('pl-pre');
      sticky.getBoundingClientRect();
      sticky.classList.add('is-on');
      for (const el of elements) el.classList.remove('pl-pre');
      s.ringsFor = -1;
    } else {
      sticky.classList.remove('is-on');
      showRings(-1);
    }
  }

  useFrame((now) => {
    const section = sectionRef.current;
    if (!section) return;
    const s = state.current;
    const n = PILLARS.length;
    const viewport = window.innerHeight;
    const rect = section.getBoundingClientRect();

    const zoom = easeOutExpo(clamp01(1 - rect.top / viewport));
    if (Math.abs(zoom - s.zoom) > 1e-4) {
      s.zoom = zoom;
      zoomRef.current!.style.setProperty('--e', zoom.toFixed(5));
    }

    const span = rect.height - viewport;
    const y = span > 0 ? clamp01(-rect.top / span) : 0;
    setOn(clamp01((viewport - rect.top) / viewport) >= 1);

    // A 30 % pause on pillar 1, then each transition (B) takes the last 35 % of its segment.
    const f = clamp01((y - 0.3) / 0.7);
    const position = (f <= 0.1 ? (f / 0.1) * 0.25 : 0.25 + ((f - 0.1) / 0.9) * 0.75) * n;
    const d = Math.min(n - 1, Math.floor(position));
    const last = d === n - 1;
    const b = last ? 0 : easeInOutCubic(clamp01((position - d - 0.65) / 0.35));

    for (let i = 1; i < n; i++) {
      const opacity = last ? Number(i === n - 1) : i === d ? 1 - b : i === d + 1 ? b : 0;
      backgroundRefs.current[i]!.style.opacity = String(opacity);
    }

    // Texts get a 0.47 / 0.53 hysteresis so a scroll stopped right at the middle does not flicker.
    const middle = !last && b >= 0.5 ? d + 1 : d;
    let wanted = middle;
    if (!last && s.visible === d + 1 && b > 0.47) wanted = d + 1;
    else if (s.visible === d && b < 0.53) wanted = d;
    if (wanted !== s.visible) {
      const first = s.visible === -1;
      s.visible = wanted;
      if (first || !s.on) setStatic(wanted);
      else if (wanted !== s.shown) swapTo(wanted);
    }
    if (!ready) {
      for (const face of faceRefs.current) {
        const src = PILLARS[middle].product.img;
        if (face && face.getAttribute('src') !== src) face.setAttribute('src', src);
      }
    }
    if (s.on) showRings(s.visible);

    const from = PILLARS[d].product;
    const to = PILLARS[Math.min(d + 1, n - 1)].product;
    const scale = designScale();
    const product = productRef.current!.style;
    product.setProperty('--py', `${lerp(from.y, to.y, b) * scale}px`);
    product.setProperty('--ps', `${PRODUCT_SIZE * scale}px`);

    let click = 0;
    if (s.clickStart >= 0) {
      const t = (now - s.clickStart) / (CLICK_SPIN_S * 1000);
      if (t >= 1) s.clickStart = -1;
      else click = easeInOutCubic(t) * 360;
    }
    const tilt = s.tilt;
    tilt.x += (tilt.targetX - tilt.x) * TILT_EASE;
    tilt.y += (tilt.targetY - tilt.y) * TILT_EASE;
    // Turns add up across segments, so the damping never runs a turn backwards at a boundary.
    const turn = last ? 0 : easeInOutSine(clamp01((position - d - SPIN_FROM) / (1 - SPIN_FROM)));
    const target = (d + turn) * 360;
    s.spin = Number.isNaN(s.spin) || Math.abs(target - s.spin) < 0.01 ? target : s.spin + (target - s.spin) * SPIN_EASE;
    const spin = s.spin + click;
    if (ready) {
      if (rect.top < viewport && rect.bottom > 0) {
        const shown = Math.min(n - 1, Math.floor(s.spin / 360 + 0.25));
        // The touched side tilts away: CSS rotateX(+) is three's rotation.x(−).
        draw(PILLARS[shown].product.model, { spin: spin * DEG, tiltX: -tilt.x * DEG, tiltY: tilt.y * DEG });
      }
    } else {
      const style = spinRef.current!.style;
      style.setProperty('--spin', `${spin}deg`);
      style.setProperty('--tx', `${tilt.x.toFixed(3)}deg`);
      style.setProperty('--ty', `${tilt.y.toFixed(3)}deg`);
    }
  });

  // The touched side tilts away, as if pushed.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = clamp01((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = clamp01((event.clientY - rect.top) / rect.height) * 2 - 1;
    state.current.tilt.targetY = nx * TILT_MAX;
    state.current.tilt.targetX = -ny * TILT_MAX;
  };
  const onPointerLeave = () => {
    state.current.tilt.targetX = 0;
    state.current.tilt.targetY = 0;
  };

  const first = PILLARS[0];
  return (
    <section ref={sectionRef} className="pillars" id="pillars">
      <div ref={stickyRef} className="pillars__sticky">
        <div ref={zoomRef} className="zoom-card">
          {PILLARS.map((_, i) => (
            <Image
              key={i}
              ref={(el) => {
                backgroundRefs.current[i] = el;
              }}
              className="pillar-bg"
              src={`/images/pillar-${i + 1}.webp`}
              alt=""
              width={1440}
              height={850}
              style={i > 0 ? { opacity: 0 } : undefined}
              aria-hidden
            />
          ))}
        </div>

        <div className="pillar-rings" aria-hidden="true">
          {PILLARS.map((pillar, i) =>
            pillar.rings.map((ring, j) => (
              <svg
                key={`${i}-${j}`}
                ref={(el) => {
                  ringRefs.current[i][j] = el;
                }}
                className="pillar-ring"
                viewBox={`0 0 ${2 * ring.r} ${2 * ring.r}`}
                style={
                  {
                    '--rx': designLength(ring.x),
                    '--ry': designLength(ring.y),
                    '--rr': designLength(ring.r),
                  } as CSSVars
                }
              >
                <circle cx={ring.r} cy={ring.r} r={ring.r} pathLength={1} strokeWidth={1} />
              </svg>
            )),
          )}
        </div>

        <div ref={productRef} className={cx('pillar-product', ready && 'is-3d')} aria-hidden="true">
          <canvas ref={canvasRef} className="pillar-product__canvas" />
          <div ref={spinRef} className="pillar-product__spin">
            {[0, 1].map((i) => (
              <Image
                key={i}
                ref={(el) => {
                  faceRefs.current[i] = el;
                }}
                className={i ? 'pillar-product__face pillar-product__face--back' : 'pillar-product__face'}
                src={first.product.img}
                alt=""
                width={1024}
                height={1024}
              />
            ))}
          </div>
          <div
            className="pillar-product__hit"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onClick={() => {
              state.current.clickStart = performance.now();
            }}
          />
        </div>

        <h2 ref={titleRef} className="pillar-title pl-el" style={{ '--pl-accent': first.accent } as CSSVars}>
          <span ref={titleARef} className="pillar-title__a">
            {first.a}
          </span>
          <span ref={titleBRef} className="pillar-title__b">
            {first.b}
          </span>
        </h2>

        <div ref={copyRef} className="pillar-copy pl-el">
          <p className="pillar-copy__num mono">
            <b ref={idRef} className="pillar-copy__id">
              {first.id}
            </b>
            /03
          </p>
          <p className="pillar-copy__desc">
            <Words text={DESCRIPTION} />
          </p>
        </div>

        <p className="pillar-tag mono pl-el">
          <Lines text={TAGLINE} />
        </p>
      </div>
    </section>
  );
}
