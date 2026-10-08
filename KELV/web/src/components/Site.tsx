'use client';

import { ScrollProvider } from '@/lib/scroll';
import { SkinAnalysis } from './analysis/SkinAnalysis';
import { Home } from './home/Home';
import { Preloader } from './preloader/Preloader';

/** Mounted once in the root layout, so the home (scroll, Lenis, 3D) stays alive under /skin-analysis. */
export function Site() {
  return (
    <ScrollProvider>
      <Preloader />
      <Home />
      <SkinAnalysis />
    </ScrollProvider>
  );
}
