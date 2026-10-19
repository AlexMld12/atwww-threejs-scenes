'use client';

import { useEffect } from 'react';
import { startScroll } from '@/lib/scroll';
import { BuiltOutside } from './built/BuiltOutside';
import { Hero } from './hero/Hero';
import { Navbar } from './nav/Navbar';
import { Preloader } from './preloader/Preloader';

export function Site() {
  useEffect(() => {
    startScroll();
  }, []);

  return (
    <>
      <Preloader />
      <Navbar />
      <main>
        <Hero />
        <BuiltOutside />
      </main>
    </>
  );
}
