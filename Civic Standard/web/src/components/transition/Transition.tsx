'use client';

import { useEffect, useRef } from 'react';
import { registerDither } from '@/lib/routes';
import { createDither } from './dither';

/** The page-change cover, over everything (routes.ts drives it). */
export function Transition() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    registerDither(createDither(canvas.current!));
    return () => registerDither(null);
  }, []);
  return <canvas ref={canvas} className="transition" aria-hidden="true" />;
}
