'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { Chrome } from '@/components/chrome/Chrome';
import { StaticReveals } from '@/components/ui/Reveal';
import { Footer } from './Footer';
import { Gallery } from './Gallery';
import { Hero } from './Hero';
import { HeroScene } from './HeroScene';
import { Join } from './Join';
import { Pillars } from './Pillars';
import { TravelProduct } from './TravelProduct';
import { useHeroSnap } from './use-hero-snap';
import { useLightBand } from './use-light-band';

// Zone 8's baked gradient is light down to 76 % of its height.
const ZONE_LIGHT_END = 0.76;

export function Home() {
  const heroProducts = useRef<HTMLImageElement>(null);
  const loopProducts = useRef<HTMLImageElement>(null);
  const join = useRef<HTMLElement>(null);
  const zone = useRef<HTMLElement>(null);
  const footer = useRef<HTMLElement>(null);

  useLightBand([
    { ref: join, end: 1 },
    { ref: zone, end: ZONE_LIGHT_END },
  ]);
  useHeroSnap();

  return (
    <div className="home">
      <Chrome />
      <Chrome dark />
      <HeroScene targets={[heroProducts, loopProducts]} />
      <TravelProduct join={join} zone={zone} footer={footer} />

      <main id="content">
        <Hero productsRef={heroProducts} />
        <Pillars />
        <Gallery />
        <Join ref={join} />
        <section ref={zone} className="travel" id="travel">
          <Image className="travel__bg" src="/images/section8-bg.webp" alt="" width={1440} height={1042} aria-hidden />
        </section>
      </main>

      <Footer ref={footer} />

      {/* Lenis `infinite` wraps from here back to 0, where the real hero shows the same frame. */}
      <section className="loop" aria-hidden="true" inert>
        <StaticReveals>
          <Hero productsRef={loopProducts} copy />
        </StaticReveals>
      </section>
    </div>
  );
}
