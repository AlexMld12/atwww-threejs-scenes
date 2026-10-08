'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Reveal } from '@/components/ui/Reveal';
import { cx } from '@/lib/css';
import type { Product } from '@/shop/catalog';
import { Accordion } from './Accordion';

/** More Informations: one question open at a time; the bar under the title advances to the next one (NEXT skips). */
export function MoreInfo({ product }: { product: Product }) {
  const [index, setIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const section = useRef<HTMLElement>(null);
  const total = product.faq.length;
  const next = () => setIndex((i) => (i + 1) % total);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={section} className="more">
      <div className="more__head">
        <Reveal as="h2" className="section-title">
          More Informations
        </Reveal>
        <Reveal as="div" className="more__nav mono" delay={0.05}>
          <span aria-live="polite">
            {index + 1}/{total}
          </span>
          <button type="button" className="sweep" onClick={next}>
            Next
          </button>
        </Reveal>
        <span
          key={index}
          className={cx('more__bar', inView && total > 1 && 'is-playing')}
          onAnimationEnd={next}
          aria-hidden="true"
        />
      </div>
      <div className="more__body">
        <Reveal as="div" className="faq">
          {product.faq.map((item, i) => (
            <Accordion
              key={item.question}
              className="faq__item"
              title={item.question}
              open={i === index}
              onToggle={() => setIndex(i)}
            >
              <p className="faq__answer">{item.answer}</p>
            </Accordion>
          ))}
        </Reveal>
        <Reveal as="div" className="more__img" delay={0.05}>
          <Image src="/images/shop/shop-scene.webp" alt="" width={2400} height={1600} unoptimized />
        </Reveal>
        <div className="more__notes">
          {product.notes.map((note, i) => (
            <Reveal key={i} className={cx('more__note', i > 0 && 'dim')} delay={0.1 + i * 0.05} lines>
              {note}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
