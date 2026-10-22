'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isHandheld } from '@/lib/device';
import type { GalleryView } from '@/scene/plaza/gallery';
import type { View } from './content';
import { heroSettled } from './settle';

type Gallery = Record<string, { distanceMax: number; views: Record<string, GalleryView> }>;
let gallery: Promise<Gallery> | null = null;
const loadGallery = () =>
  (gallery ??= fetch('/gallery/gallery.json').then((r) => (r.ok ? (r.json() as Promise<Gallery>) : ({} as Gallery))));

/**
 * A picture: the product in the plaza, the leaves' shadow moving over it (scene/plaza/gallery.ts). Under it a still of
 * the same picture (tools/capture_gallery_posters.py), there at once: the plates take a moment, the space never waits.
 */
export function Picture({
  product,
  view,
  className,
  children,
}: {
  product: string;
  view: View;
  className: string;
  children?: ReactNode;
}) {
  const figure = useRef<HTMLElement>(null);
  const mask = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  // Uncovered from the bottom up, as the site's images, but from the screen's foot, not the picture's: a picture
  // taller than what shows of it would otherwise uncover its unseen part first (a blank space) or, the other way,
  // flash its seen part in at once. Played once, as its top reaches 85 % of the screen (use-reveal's line).
  useEffect(() => {
    const element = figure.current!;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.at(-1)!.isIntersecting) return;
        observer.disconnect();
        const { top, height } = element.getBoundingClientRect();
        const hidden = Math.min(1, Math.max(0, (window.innerHeight - top) / height));
        const style = mask.current!.style;
        style.transition = 'none';
        style.clipPath = `inset(${hidden * 100}% 0 0 0)`;
        void mask.current!.offsetHeight;
        style.transition = '';
        style.clipPath = 'inset(0)';
        element.classList.add('is-in');
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    // a phone or a tablet keeps the still: the live leaves cost a whole WebGL context and a copy every frame
    if (isHandheld()) return;
    heroSettled()
      .then(() => Promise.all([loadGallery(), import('@/scene/plaza/gallery')]))
      .then(([all, { createGalleryImage }]) => {
        const entry = all[product];
        // a view not rendered yet for this product: the still alone
        if (!entry?.views[view] || cancelled) return;
        dispose = createGalleryImage(canvas.current!, `${product}-${view}`, entry.views[view], entry.distanceMax, () =>
          setReady(true),
        );
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
      dispose?.();
      setReady(false);
    };
  }, [product, view]);

  return (
    // the figure is watched, its mask is clipped: a clipped element is unseen by an observer. React leaves the
    // figure's classes alone (is-in is added above): a re-render that rewrote them closed the mask mid-reveal.
    <figure ref={figure} className={`picture ${className}`} data-view={view}>
      <div ref={mask} className={`picture__mask${ready ? ' is-ready' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a still under the canvas, Figma's size */}
        <img className="picture__poster" src={`/gallery/${product}-${view}-poster.webp`} alt="" decoding="async" />
        <canvas ref={canvas} className="picture__canvas" />
        {children}
      </div>
    </figure>
  );
}
