'use client';

import Image from 'next/image';
import { PageLink } from '@/components/layers/PageLink';
import { Reveal } from '@/components/ui/Reveal';
import { RollText } from '@/components/ui/RollText';
import { useCart } from '@/shop/cart';
import { formatPrice, type ComingSoon, type Product } from '@/shop/catalog';
import { EmailForm } from './EmailForm';

const STAGGER = 0.08;

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { add } = useCart();
  const href = `/products/${product.slug}`;
  return (
    <Reveal as="article" className="card" delay={index * STAGGER}>
      <PageLink href={href} className="card__media" aria-label={product.name}>
        <span className="pill mono">Step {product.step}/3</span>
        <Image className="card__img" src={product.image} alt="" width={1024} height={1024} unoptimized />
      </PageLink>
      <div className="card__body">
        <PageLink href={href} className="card__title">
          {product.title}
        </PageLink>
        <p className="card__summary">{product.summary}</p>
        <dl className="card__table mono">
          <div>
            <dt>Active</dt>
            <dd>{product.active}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>{product.when}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{product.size}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="shop-btn shop-btn--dark card__add mono"
          data-roll-host=""
          onClick={() => add(product.slug)}
        >
          <span className="card__add-label">
            <RollText text="Add to cart" />
            <PlusIcon />
          </span>
          <span>{formatPrice(product.price)}</span>
        </button>
      </div>
    </Reveal>
  );
}

export function ComingSoonCard({ item, index }: { item: ComingSoon; index: number }) {
  return (
    <Reveal as="article" className="soon" delay={index * STAGGER}>
      <div className="soon__media">
        <span className="pill pill--soon mono">Coming soon</span>
        <Image className="soon__img" src="/images/shop/coming-soon.webp" alt="" width={800} height={820} unoptimized />
      </div>
      <div className="soon__body">
        <p className="card__title">{item.name}</p>
        <p className="card__summary">{item.summary}</p>
        <EmailForm variant="notify" />
        <p className="soon__note">
          This set is coming. Built for those who need to stay grounded under pressure — mentally clear, hormonally
          balanced, consistently steady.
        </p>
      </div>
    </Reveal>
  );
}

export function PlusIcon() {
  return (
    <svg className="plus" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5h10M5 0v10" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  );
}
