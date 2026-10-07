import Image from 'next/image';
import type { Ref } from 'react';
import { Mega } from '@/components/ui/Mega';
import { Reveal } from '@/components/ui/Reveal';

const INFO = 'Three steps back to baseline. Three steps back to baseline.';

interface HeroProps {
  /** The Figma render's box: the 3D canvas is laid over it, and it is the no-WebGL fallback. */
  productsRef: Ref<HTMLImageElement>;
  /** The copy after the footer, for the seamless loop back to the top. */
  copy?: boolean;
}

export function Hero({ productsRef, copy = false }: HeroProps) {
  return (
    <section className="hero" id={copy ? undefined : 'hero'}>
      <Image
        className="hero__glow"
        src="/images/hero-glow.webp"
        alt=""
        width={2602}
        height={2210}
        preload={!copy}
        loading="eager"
        aria-hidden
      />
      <Mega as={copy ? 'p' : 'h1'} className="hero__mega" />
      <Image
        ref={productsRef}
        className="hero__placeholder"
        src="/images/products-placeholder.webp"
        alt=""
        width={1322}
        height={1377}
        aria-hidden
      />
      <Reveal className="hero__info hero__info--l mono" delay={0.1} lines>
        {INFO}
      </Reveal>
      <Reveal className="hero__info hero__info--r mono" lines>
        {INFO}
      </Reveal>
      <Reveal className="hero__para" lines>
        Pump 2 doses onto damp skin foded ripsid doses onto damp skin foded.
      </Reveal>
    </section>
  );
}
