'use client';

import { useRef, type RefObject } from 'react';
import { clamp01, lerp } from '@/lib/math';
import { useFrame } from '@/lib/scroll';

// Grows from its design size until it covers the zone's background (the user's request: no white space).
const FROM = { scale: 0.85, y: 0.25 };
const TO = { scale: 1.9, y: -0.2 };

/** Zone 8's blue glow grows and rises while the zone scrolls through, until it fills the zone. */
export function useZoneGlow(zone: RefObject<HTMLElement | null>) {
  const glow = useRef<HTMLDivElement>(null);
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
