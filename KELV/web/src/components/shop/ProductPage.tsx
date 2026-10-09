'use client';

import Image from 'next/image';
import { useState } from 'react';
import { PageLink } from '@/components/layers/PageLink';
import { Reveal } from '@/components/ui/Reveal';
import { RollText } from '@/components/ui/RollText';
import { useCart } from '@/shop/cart';
import { PRODUCTS, formatPrice, type Product } from '@/shop/catalog';
import { Accordion } from './Accordion';
import { MoreInfo } from './MoreInfo';
import { ProductCard } from './ProductCard';
import { ProductViewer } from './ProductViewer';
import { useStickySide } from './use-sticky-side';

export function ProductPage({ product }: { product: Product }) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const info = useStickySide<HTMLDivElement>();
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));

  return (
    <>
      <section className="pdp">
        <div className="pdp__media">
          <div className="pdp__hero">
            <span className="pill mono">Step {product.step}/3</span>
            <Reveal as="div" className="pdp__product" fx="blur">
              <ProductViewer product={product} />
            </Reveal>
          </div>
          <div className="pdp__scene">
            <Image src="/images/shop/shop-scene.webp" alt="" width={2400} height={1600} unoptimized />
          </div>
        </div>

        <div className="pdp__info" ref={info}>
          <div className="pdp__intro">
            <Reveal className="crumbs mono">
              <PageLink href="/products" className="dim">
                Products
              </PageLink>{' '}
              <span className="dim">/</span> {product.name}
            </Reveal>
            <Reveal as="h1" className="pdp__title" delay={0.05}>
              {product.title}
            </Reveal>
            <Reveal className="pdp__lead" delay={0.1} lines>
              {product.lead}
            </Reveal>
            <Reveal className="pdp__price" delay={0.15}>
              {formatPrice(product.price)}
            </Reveal>
          </div>

          <div className="pdp__details">
            <Reveal className="pdp__label mono">Details</Reveal>
            <Reveal className="pdp__para" delay={0.05} lines>
              {product.details}
            </Reveal>
            <Reveal as="dl" className="specs mono" delay={0.1}>
              {product.specs.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <SpecValue label={label} value={value} />
                  </dd>
                </div>
              ))}
            </Reveal>
          </div>

          <Reveal as="div" className="buy" delay={0.1}>
            <Stepper value={quantity} onChange={setQuantity} />
            <button
              type="button"
              className="shop-btn shop-btn--light mono"
              data-roll-host=""
              onClick={() => add(product.slug, quantity)}
            >
              <RollText text="Add to cart" />
            </button>
            <button
              type="button"
              className="shop-btn shop-btn--dark shop-btn--center mono"
              data-roll-host=""
              onClick={() => add(product.slug, quantity)}
            >
              <RollText text="Buy it now" />
            </button>
          </Reveal>

          <Accordion className="pdp__acc" title="How to use" open={open === 'how'} onToggle={() => toggle('how')}>
            <ol className="pdp__steps">
              {product.howTo.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Accordion>
          <Accordion
            className="pdp__acc"
            title="Ingredients (INCI)"
            open={open === 'inci'}
            onToggle={() => toggle('inci')}
          >
            <p className="pdp__inci">{product.inci}</p>
          </Accordion>
          <div className="pairs">
            <span className="pdp__label mono">Pairs with</span>
            <span className="mono">{product.pairs}</span>
          </div>
        </div>
      </section>

      <section className="discover">
        <Reveal as="h2" className="section-title">
          Discover All Products
        </Reveal>
        <Reveal className="group__label discover__label" delay={0.05}>
          KELV Skincare{' '}
          <PageLink href="/products" className="dim">
            [View all]
          </PageLink>
        </Reveal>
        <div className="grid">
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.slug} product={p} index={i} />
          ))}
        </div>
      </section>

      <MoreInfo product={product} />
    </>
  );
}

export function Stepper({
  value,
  onChange,
  small,
}: {
  value: number;
  onChange: (value: number) => void;
  small?: boolean;
}) {
  return (
    <div className={small ? 'stepper stepper--small' : 'stepper'}>
      <button type="button" aria-label="Decrease quantity" onClick={() => onChange(Math.max(small ? 0 : 1, value - 1))}>
        -
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

/** Figma sets the amount of the size in bold ("150 ml, about 60 days of daily use"). */
function SpecValue({ label, value }: { label: string; value: string }) {
  const comma = value.indexOf(',');
  if (label !== 'Size' || comma < 0) return <>{value}</>;
  return (
    <>
      <b>{value.slice(0, comma)}</b>
      {value.slice(comma)}
    </>
  );
}
