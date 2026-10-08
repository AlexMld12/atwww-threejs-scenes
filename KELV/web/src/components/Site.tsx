'use client';

import { registerScrim } from '@/lib/page-layers';
import { ScrollProvider } from '@/lib/scroll';
import { CartProvider } from '@/shop/cart';
import { SkinAnalysis } from './analysis/SkinAnalysis';
import { Home } from './home/Home';
import { useLayerRouter } from './layers/use-page-layer';
import { Preloader } from './preloader/Preloader';
import { Shop } from './shop/Shop';

/** Mounted once in the root layout, so the home (scroll, Lenis, 3D) stays alive under the other pages. */
export function Site() {
  return (
    <ScrollProvider>
      <CartProvider>
        <Preloader />
        <Home />
        <Layers />
      </CartProvider>
    </ScrollProvider>
  );
}

function Layers() {
  useLayerRouter();
  return (
    <>
      <div ref={registerScrim} className="layer-scrim" aria-hidden="true" />
      <SkinAnalysis />
      <Shop />
    </>
  );
}
