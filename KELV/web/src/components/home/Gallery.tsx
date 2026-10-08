'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { setChromeVar } from '@/components/chrome/chrome-vars';
import { Words } from '@/components/ui/Words';
import { clamp01, smoothstep } from '@/lib/math';
import { useFrame } from '@/lib/scroll';
import { useWisdomScene } from './use-wisdom-scene';

const TEXT =
  'Sun, sweat and city air put skin under pressure. KELV brings it back to baseline: cleanse with K1, calm with K2 and seal with K3. Three considered formulas. One daily recovery routine.';

const LERP = 0.1;
const CENTRE_END = 0.35;
const ZOOM_SLOW_END = 0.45;
const ZOOM_END = 0.92;
const ZOOM_SLOW_SHARE = 0.15;
// On Ancient Wisdom: the header and CTAs come back, the CTAs rise to the middle, then the text.
const CHROME_AT = 0.6;
const CTA_FROM = 0.64;
const CTA_LENGTH = 0.1;
const TEXT_FROM = 0.76;
const TEXT_LENGTH = 0.12;

const TILES = [
  { className: 'g-tile--r1l', src: '/images/gallery-1.webp' },
  { className: 'g-tile--r1r', src: '/images/gallery-2.webp' },
  { className: 'g-tile--r2l', src: '/images/gallery-3.webp' },
  { className: 'g-tile--r2r', src: '/images/gallery-4.webp' },
  { className: 'g-tile--r3l', src: '/images/gallery-5.webp' },
  { className: 'g-tile--r3r', src: '/images/gallery-6.webp' },
];

// Slow cubic start, then a cubic ease-out until the scene covers the screen.
function zoomCurve(e: number) {
  if (e <= ZOOM_SLOW_END) return Math.pow(e / ZOOM_SLOW_END, 3) * ZOOM_SLOW_SHARE;
  const t = clamp01((e - ZOOM_SLOW_END) / (ZOOM_END - ZOOM_SLOW_END));
  return ZOOM_SLOW_SHARE + (1 - ZOOM_SLOW_SHARE) * (1 - Math.pow(1 - t, 3));
}

/** 05–06: the grid zooms into the Ancient Wisdom scene, then Ancient Wisdom fades in (drinksom.eu "origin"). */
export function Gallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const screenMaskRef = useRef<HTMLDivElement>(null);
  const wisdomRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const canvasRef = useWisdomScene(sectionRef, tileRef);
  const state = useRef({ eased: 0, wordsIn: false, chromeOff: false, shift: -1, frame: { w: 1, h: 1, cy: 0 } });

  useEffect(() => {
    const tile = tileRef.current;
    const zoom = zoomRef.current;
    if (!tile || !zoom) return;
    const measure = () => {
      const frame = { w: tile.offsetWidth, h: tile.offsetHeight, cy: tile.offsetTop + tile.offsetHeight / 2 };
      state.current.frame = frame;
      zoom.style.transformOrigin = `${tile.offsetLeft + frame.w / 2}px ${frame.cy}px`;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    for (const word of textRef.current?.querySelectorAll('.sw-in') ?? []) word.classList.add('is-below');
    return () => {
      document.documentElement.classList.remove('chrome-off');
      setChromeVar('--cta-shift', null);
    };
  }, []);

  useFrame(() => {
    const section = sectionRef.current;
    const zoom = zoomRef.current;
    const mask = maskRef.current;
    const screenMask = screenMaskRef.current;
    const wisdom = wisdomRef.current;
    if (!section || !zoom || !mask || !screenMask || !wisdom) return;
    const s = state.current;
    const { innerWidth: vw, innerHeight: vh } = window;
    const rect = section.getBoundingClientRect();
    const span = rect.height - vh;
    const raw = span > 0 ? clamp01(-rect.top / span) : 0;
    s.eased = Math.abs(raw - s.eased) > 1e-4 ? s.eased + (raw - s.eased) * LERP : raw;
    const e = s.eased;

    const centre = smoothstep(clamp01(e / CENTRE_END));
    const grow = zoomCurve(e);
    const { frame } = s;
    const scale = 1 + (Math.max(vw / frame.w, vh / frame.h) - 1) * grow;
    zoom.style.transform = `translateY(${(-(frame.cy - vh / 2) * centre).toFixed(2)}px) scale(${scale.toFixed(4)})`;

    // Over the scene the two masks compose to 5 % → 70 %; at full size only the screen mask is left.
    const screenOpacity = 0.7 * grow;
    const tileOpacity = Math.max(0, 1 - (1 - (0.05 + 0.65 * grow)) / (1 - screenOpacity));
    screenMask.style.setProperty('--g-screen', screenOpacity.toFixed(4));
    mask.style.setProperty('--g-mask', tileOpacity.toFixed(4));
    wisdom.style.setProperty('--g-o', clamp01((e - TEXT_FROM) / TEXT_LENGTH).toFixed(3));

    const wordsProgress = clamp01((raw - TEXT_FROM) / TEXT_LENGTH);
    const words = () => textRef.current?.querySelectorAll<HTMLElement>('.sw-in') ?? [];
    if (wordsProgress > 0.05 && !s.wordsIn) {
      s.wordsIn = true;
      words().forEach((word, i) => {
        word.style.transitionDelay = `${0.15 + 0.03 * i}s`;
        word.classList.replace('is-below', 'is-enter');
      });
    } else if (wordsProgress === 0 && s.wordsIn) {
      s.wordsIn = false;
      for (const word of words()) {
        word.classList.remove('is-enter');
        word.style.transitionDelay = '';
        word.classList.add('is-below');
      }
    }

    const inSection = rect.top < vh * 0.5 && rect.bottom > vh * 0.5;
    const chromeOff = inSection && e < CHROME_AT;
    if (chromeOff !== s.chromeOff) {
      s.chromeOff = chromeOff;
      document.documentElement.classList.toggle('chrome-off', chromeOff);
    }

    // The CTAs go back down while the next section's edge rises from the bottom to the middle.
    const leaving = clamp01((rect.bottom - vh * 0.5) / (vh * 0.5));
    const rise = rect.top < vh * 0.5 ? clamp01((e - CTA_FROM) / CTA_LENGTH) * leaving : 0;
    const shift = smoothstep(rise);
    if (Math.abs(shift - s.shift) > 1e-4) {
      s.shift = shift;
      setChromeVar('--cta-shift', shift.toFixed(4));
    }
  });

  return (
    <section ref={sectionRef} className="gallery" id="gallery">
      <div className="gallery__sticky">
        <div ref={zoomRef} className="gallery__zoom">
          {TILES.slice(0, 3).map((tile) => (
            <GalleryTile key={tile.src} {...tile} />
          ))}
          <div ref={tileRef} className="g-tile g-tile--scene">
            <canvas ref={canvasRef} className="g-scene" aria-hidden="true" />
            <div ref={maskRef} className="g-mask" aria-hidden="true" />
          </div>
          {TILES.slice(3).map((tile) => (
            <GalleryTile key={tile.src} {...tile} />
          ))}
        </div>

        <div ref={screenMaskRef} className="g-screen-mask" aria-hidden="true" />

        <div ref={wisdomRef} className="wisdom">
          <h2 className="wisdom__title">
            <span className="wisdom__a">Ancient</span> <span className="wisdom__b">Wisdom</span>
          </h2>
          <p ref={textRef} className="wisdom__text">
            <Words text={TEXT} />
          </p>
        </div>
      </div>
    </section>
  );
}

function GalleryTile({ className, src }: { className: string; src: string }) {
  return (
    <div className={`g-tile ${className}`}>
      <Image src={src} alt="" width={705} height={400} />
    </div>
  );
}
