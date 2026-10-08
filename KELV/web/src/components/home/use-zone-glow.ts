'use client';

import { useRef, type RefObject } from 'react';
import { clamp01, lerp } from '@/lib/math';
import { useFrame } from '@/lib/scroll';

// At the Figma frame (zone 8 filling the screen) the ellipse is at its design size and place.
const FROM = { scale: 0.8, y: 0.25 };
const TO = { scale: 1.05, y: -0.05 };

/** Zone 8's blue glow grows and rises while the zone scrolls through, towards the footer. */
export function useZoneGlow(zone: RefObject<HTMLElement | null>) {
  const glow = useRef<HTMLImageElement>(null);
  const last = useRef(-1);
  useFrame(() => {
    const section = zone.current;
    const image = glow.current;
    if (!section || !image) return;
    const vh = window.innerHeight;
    const rect = section.getBoundingClientRect();
    if (rect.bottom < -vh || rect.top > vh) return;
    const p = clamp01((vh - rect.top) / rect.height);
    if (Math.abs(p - last.current) < 1e-4) return;
    last.current = p;
    const scale = lerp(FROM.scale, TO.scale, p);
    const y = lerp(FROM.y, TO.y, p) * 100;
    image.style.transform = `translateY(${y.toFixed(2)}%) scale(${scale.toFixed(4)})`;
  });
  return glow;
}
