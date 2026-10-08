'use client';

import type { ReactNode } from 'react';
import { PageLink } from '@/components/layers/PageLink';
import { Reveal } from '@/components/ui/Reveal';
import { useCart } from '@/shop/cart';
import { PRODUCTS } from '@/shop/catalog';
import { EmailForm } from './EmailForm';

const SOCIALS = ['Facebook', 'LinkedIn', 'Instagram', 'Tik-Tok'];
const TERMS = [
  { href: '/privacy-policy', label: 'Privacy policy' },
  { href: '/terms-of-use#refunds', label: 'Refund policy' },
  { href: '/terms-of-use#shipping', label: 'Shipping policy' },
  { href: '/terms-of-use', label: 'Terms of use' },
];

export function ShopFooter() {
  const { setOpen } = useCart();
  return (
    <footer className="shop-foot">
      <div className="shop-foot__top">
        <nav className="shop-foot__cols mono" aria-label="Footer">
          <FootColumn title="Products">
            {PRODUCTS.map((product) => (
              <PageLink key={product.slug} href={`/products/${product.slug}`} className="shop-foot__link">
                {product.title}
              </PageLink>
            ))}
          </FootColumn>
          <FootColumn title="Explore">
            <PageLink href="/products" className="shop-foot__link">
              Shop
            </PageLink>
            <PageLink href="/" className="shop-foot__link">
              Homepage
            </PageLink>
            <button type="button" className="shop-foot__link" onClick={() => setOpen(true)}>
              Cart
            </button>
          </FootColumn>
          <FootColumn title="Socials">
            {SOCIALS.map((label) => (
              <a key={label} href="#" className="shop-foot__link">
                {label}
              </a>
            ))}
          </FootColumn>
          <FootColumn title="Terms">
            {TERMS.map((term) => (
              <PageLink key={term.label} href={term.href} className="shop-foot__link">
                {term.label}
              </PageLink>
            ))}
          </FootColumn>
        </nav>
        <Reveal as="div" className="shop-updates" delay={0.1}>
          <p className="shop-updates__title">
            <span className="shop-title__a">Receive</span>
            <span className="shop-title__b">Updates</span>
          </p>
          <p className="shop-updates__text">Get KELV routine notes, product news and daily recovery tips.</p>
          <EmailForm variant="updates" />
        </Reveal>
      </div>
      <Reveal as="div" className="shop-foot__bar mono">
        <span>2026 — KELV Inc. ALL RIGHTS RESERVED</span>
        <span>
          WEBSITE BY{' '}
          <a href="https://www.atwww.studio/" target="_blank" rel="noopener" className="shop-foot__by">
            ATWWW
          </a>
        </span>
      </Reveal>
    </footer>
  );
}

function FootColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal as="div" className="shop-foot__col">
      <span className="shop-foot__heading">{title}</span>
      <span className="shop-foot__links">{children}</span>
    </Reveal>
  );
}
