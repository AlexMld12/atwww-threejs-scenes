'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { usePageLayer } from '@/components/layers/use-page-layer';
import { RevealDelay } from '@/components/ui/Reveal';
import { cx } from '@/lib/css';
import { layerFor, normalizePath } from '@/lib/page-layers';
import { useScroll } from '@/lib/scroll';
import { productBySlug } from '@/shop/catalog';
import { legalByPath } from '@/shop/legal';
import { CartDrawer } from './CartDrawer';
import { LegalPage } from './LegalPage';
import { ProductPage } from './ProductPage';
import { ProductsPage } from './ProductsPage';
import { ShopFooter } from './ShopFooter';
import { ShopHeader } from './ShopHeader';

const SWAP_MS = 350;

/** The shop layer: products, product pages and the legal pages, with their header, footer and the cart. */
export function Shop() {
  const pathname = usePathname();
  const own = layerFor(pathname) === 'shop' ? normalizePath(pathname) : null;
  const { lenis } = useScroll();
  const [page, setPage] = useState(own ?? '/products');
  const [leaving, setLeaving] = useState(false);
  const [entry, setEntry] = useState({ key: 0, delay: 0 });

  const enter = useCallback((delay: number) => setEntry((e) => ({ key: e.key + 1, delay })), []);
  const panel = usePageLayer('shop', enter);

  // A link inside the shop: the content fades out, is swapped at the top of the page, then plays its entrance.
  useEffect(() => {
    if (!own || own === page) return;
    // Not the page yet (it is about to slide in): no fade, the entrance plays with the slide.
    const swap = document.documentElement.dataset.page === 'shop';
    const fade = swap ? requestAnimationFrame(() => setLeaving(true)) : 0;
    const timer = setTimeout(
      () => {
        setPage(own);
        setLeaving(false);
        if (!swap) return;
        setEntry((e) => ({ key: e.key + 1, delay: 0 }));
        lenis?.scrollTo(0, { immediate: true, force: true });
      },
      swap ? SWAP_MS : 0,
    );
    return () => {
      cancelAnimationFrame(fade);
      clearTimeout(timer);
    };
  }, [own, page, lenis]);

  // /terms-of-use#refunds: the section is scrolled to once the page is in place.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (target && lenis && document.documentElement.dataset.page === 'shop') {
      lenis.scrollTo(target, { offset: -120, duration: 1 });
    }
  }, [entry, lenis]);

  const legal = legalByPath(page);
  const product = page.startsWith('/products/') ? productBySlug(page.slice('/products/'.length)) : undefined;

  return (
    <div ref={panel} className="shop page-layer" id="shop">
      <ShopHeader title={legal?.title ?? ['Shop', 'Products']} />
      <RevealDelay.Provider value={entry.delay}>
        <div className={cx('shop-main', leaving && 'is-leaving')} key={`${entry.key}${page}`}>
          {legal ? <LegalPage doc={legal} /> : product ? <ProductPage product={product} /> : <ProductsPage />}
          <ShopFooter />
        </div>
      </RevealDelay.Provider>
      <CartDrawer />
    </div>
  );
}
