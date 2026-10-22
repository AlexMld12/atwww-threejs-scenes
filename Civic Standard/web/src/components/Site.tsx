'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { onHandover, sceneIn } from '@/lib/intro';
import {
  announceEnter,
  currentSlug,
  currentView,
  entryCount,
  followHistory,
  isHomeVisited,
  slugFor,
  startView,
  subscribe,
  viewFor,
} from '@/lib/routes';
import { setScrollLocked, startScroll } from '@/lib/scroll';
import { BuiltOutside } from './built/BuiltOutside';
import { Configurator } from './configurator/Configurator';
import { ConfiguratorPage } from './configurator/ConfiguratorPage';
import { Details } from './details/Details';
import { Values } from './details/Values';
import { Footer } from './footer/Footer';
import { Hero } from './hero/Hero';
import { Navbar } from './nav/Navbar';
import { Pillars } from './pillars/Pillars';
import { Preloader } from './preloader/Preloader';
import { Product } from './product/Product';
import { Products } from './products/Products';
import { QuoteDrawer } from './quote/QuoteDrawer';
import { Range } from './range/Range';
import { Stay } from './stay/Stay';
import { Transition } from './transition/Transition';

/** The whole site in one document: the home stays mounted under another page (routes.ts). */
export function Site() {
  const pathname = usePathname();
  // the page the document was loaded on, set before anything reads it
  useState(() => startView(viewFor(pathname), slugFor(pathname)));
  const view = useSyncExternalStore(subscribe, currentView, () => viewFor(pathname));
  const slug = useSyncExternalStore(subscribe, currentSlug, () => slugFor(pathname));
  const entry = useSyncExternalStore(subscribe, entryCount, () => 0);
  const home = useSyncExternalStore(subscribe, isHomeVisited, () => viewFor(pathname) === 'home');

  useEffect(() => {
    startScroll();
    window.addEventListener('popstate', followHistory);
    // Entered on another page: no preloader there (the home's own), the page is free and comes in at once.
    let frame = 0;
    if (currentView() !== 'home') {
      setScrollLocked(false);
      sceneIn();
      frame = requestAnimationFrame(() => announceEnter());
    }
    const stop = onHandover(() => announceEnter());
    return () => {
      window.removeEventListener('popstate', followHistory);
      cancelAnimationFrame(frame);
      stop();
    };
  }, []);

  return (
    <>
      {home && <Preloader />}
      <Transition />
      <Navbar />
      <main data-view={view}>
        {home && (
          <div className="view view--home" hidden={view !== 'home'}>
            <Hero />
            <BuiltOutside />
            <Pillars />
            <Details />
            <Values />
            <Range />
          </div>
        )}
        {/* mounted at each visit, so its entrance plays again */}
        {view === 'products' && <Products key={entry} />}
        {view === 'product' && <Product key={entry} slug={slug} />}
        {view === 'configurator' && <ConfiguratorPage key={entry} />}
        {/* the home's and the products' closing sections; a product's page has its own, the configurator none */}
        <div className="view" hidden={view === 'product' || view === 'configurator'}>
          <Configurator />
          <Stay />
        </div>
      </main>
      {view !== 'configurator' && <Footer />}
      <QuoteDrawer />
    </>
  );
}
