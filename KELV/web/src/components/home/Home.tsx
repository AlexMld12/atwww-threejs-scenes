'use client';

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
import { useZoneGlow } from './use-zone-glow';

// Zone 8 turns navy over its last 560 of 1042 design px (travel.css): the header flips halfway through.
const ZONE_LIGHT_END = 0.73;

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
  const zoneGlow = useZoneGlow(zone);

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
          <div ref={zoneGlow} className="travel__glow" aria-hidden="true" />
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
