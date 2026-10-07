'use client';

import { ScrollProvider } from '@/lib/scroll';
import { SkinAnalysis } from './analysis/SkinAnalysis';
import { Home } from './home/Home';

/**
 * The whole site, mounted once in the root layout so that navigating between `/` and
 * `/skin-analysis` keeps the home page (scroll, Lenis, 3D scene) alive under the analysis.
 */
export function Site() {
  return (
    <ScrollProvider>
      <Home />
      <SkinAnalysis />
    </ScrollProvider>
  );
}
