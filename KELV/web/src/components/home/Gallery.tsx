'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { Words } from '@/components/ui/Words';
import { clamp01, smoothstep } from '@/lib/math';
import { useFrame } from '@/lib/scroll';

const TEXT =
  'Lorem ipsum dolor sit amet consectetur. Ultricies sagittis id lorem id enim velit id sodales mauris. Augue vel mauris m ipsum dolor sit amet consectetur. Ultricies sagittis id lorem id enim velit id sodales mauris.';

const LERP = 0.1;
const ZOOM_SLOW_END = 0.45;
const ZOOM_END = 0.92;
const ZOOM_SLOW_SHARE = 0.15;
/** Return order on Ancient Wisdom: header + CTAs at the bottom → CTAs rise to the middle → texts. */
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

/**
 * Sticky 280vh section, formulas from drinksom.eu's "origin": the grid centres on the video
 * and scales it to cover the screen, then Ancient Wisdom fades in. The navy masks (5 % in
 * the grid → 70 % on Ancient Wisdom) are from the Figma frames.
 */
export function Gallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const screenMaskRef = useRef<HTMLDivElement>(null);
  const wisdomRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const state = useRef({ eased: 0, wordsIn: false, chromeOff: false, shift: -1, video: { w: 1, h: 1, cy: 0 } });

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;
    // Loaded one screen ahead, as on drinksom, instead of on first paint.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        video.src = video.dataset.src ?? '';
        video.play().catch(() => {});
        observer.disconnect();
      },
      { rootMargin: '100%' },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tile = tileRef.current;
    const zoom = zoomRef.current;
    if (!tile || !zoom) return;
    const measure = () => {
      const geometry = {
        w: tile.offsetWidth,
        h: tile.offsetHeight,
        cy: tile.offsetTop + tile.offsetHeight / 2,
      };
      state.current.video = geometry;
      zoom.style.transformOrigin = `${tile.offsetLeft + geometry.w / 2}px ${geometry.cy}px`;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    for (const word of textRef.current?.querySelectorAll('.sw-in') ?? []) word.classList.add('is-below');
    const root = document.documentElement;
    return () => {
      root.classList.remove('chrome-off');
      root.style.removeProperty('--cta-shift');
    };
  }, []);

  useFrame(() => {
    const section = sectionRef.current;
    if (!section) return;
    const s = state.current;
    const root = document.documentElement;
    const { innerWidth: vw, innerHeight: vh } = window;
    const rect = section.getBoundingClientRect();
    const span = rect.height - vh;
    const raw = span > 0 ? clamp01(-rect.top / span) : 0;
    s.eased = Math.abs(raw - s.eased) > 1e-4 ? s.eased + (raw - s.eased) * LERP : raw;
    const e = s.eased;

    const centre = smoothstep(clamp01(e / 0.35));
    const grow =
      e <= ZOOM_SLOW_END
        ? Math.pow(e / ZOOM_SLOW_END, 3) * ZOOM_SLOW_SHARE
        : ZOOM_SLOW_SHARE +
          (1 - ZOOM_SLOW_SHARE) * (1 - Math.pow(1 - clamp01((e - ZOOM_SLOW_END) / (ZOOM_END - ZOOM_SLOW_END)), 3));
    const { video } = s;
    const scale = 1 + (Math.max(vw / video.w, vh / video.h) - 1) * grow;
    zoomRef.current!.style.transform = `translateY(${(-(video.cy - vh / 2) * centre).toFixed(2)}px) scale(${scale.toFixed(4)})`;

    // Over the video the two masks compose to 5 % → 70 %; at full size only the screen mask is left.
    const screenMask = 0.7 * grow;
    const tileMask = Math.max(0, 1 - (1 - (0.05 + 0.65 * grow)) / (1 - screenMask));
    screenMaskRef.current!.style.setProperty('--g-screen', screenMask.toFixed(4));
    maskRef.current!.style.setProperty('--g-mask', tileMask.toFixed(4));
    wisdomRef.current!.style.setProperty('--g-o', clamp01((e - TEXT_FROM) / TEXT_LENGTH).toFixed(3));

    const wordsProgress = clamp01((raw - TEXT_FROM) / TEXT_LENGTH);
    const words = textRef.current!.querySelectorAll<HTMLElement>('.sw-in');
    if (wordsProgress > 0.05 && !s.wordsIn) {
      s.wordsIn = true;
      words.forEach((word, j) => {
        word.style.transitionDelay = `${0.15 + 0.03 * j}s`;
        word.classList.replace('is-below', 'is-enter');
      });
    } else if (wordsProgress === 0 && s.wordsIn) {
      s.wordsIn = false;
      for (const word of words) {
        word.classList.remove('is-enter');
        word.style.transitionDelay = '';
        word.classList.add('is-below');
      }
    }

    const inSection = rect.top < vh * 0.5 && rect.bottom > vh * 0.5;
    const chromeOff = inSection && e < CHROME_AT;
    if (chromeOff !== s.chromeOff) {
      s.chromeOff = chromeOff;
      root.classList.toggle('chrome-off', chromeOff);
    }

    // The CTAs go back down while the next section's edge rises from the bottom to the middle.
    const leaving = clamp01((rect.bottom - vh * 0.5) / (vh * 0.5));
    const rise = rect.top < vh * 0.5 ? clamp01((e - CTA_FROM) / CTA_LENGTH) * leaving : 0;
    const shift = smoothstep(rise);
    if (Math.abs(shift - s.shift) > 1e-4) {
      s.shift = shift;
      root.style.setProperty('--cta-shift', shift.toFixed(4));
    }
  });

  return (
    <section ref={sectionRef} className="gallery" id="gallery">
      <div className="gallery__sticky">
        <div ref={zoomRef} className="gallery__zoom">
          {TILES.slice(0, 3).map((tile) => (
            <GalleryTile key={tile.src} {...tile} />
          ))}
          <div ref={tileRef} className="g-tile g-tile--video">
            <video
              ref={videoRef}
              className="g-video"
              data-src="/video/placeholder.mp4"
              poster="/images/video-poster.webp"
              muted
              loop
              playsInline
              autoPlay
              preload="none"
              aria-hidden="true"
            />
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
