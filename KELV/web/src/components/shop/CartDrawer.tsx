'use client';

import Image from 'next/image';
import { useEffect } from 'react';
import { PageLink } from '@/components/layers/PageLink';
import { ArrowIcon } from '@/components/ui/icons';
import { RollText } from '@/components/ui/RollText';
import { cx } from '@/lib/css';
import { useScroll } from '@/lib/scroll';
import { useCart } from '@/shop/cart';
import { FREE_SHIPPING, formatPrice } from '@/shop/catalog';
import { Stepper } from './ProductPage';

/** The cart drawer (CART / Empty CART frames). Checkout is not connected to a store yet. */
export function CartDrawer() {
  const { lines, count, subtotal, open, setOpen, setQuantity, remove } = useCart();
  const { lenis } = useScroll();
  const close = () => setOpen(false);
  const missing = FREE_SHIPPING - subtotal;

  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      lenis?.start();
      document.removeEventListener('keydown', onKey);
    };
  }, [open, lenis, setOpen]);

  return (
    <div className={cx('cart', open && 'is-open')} aria-hidden={!open} inert={!open}>
      <div className="cart__scrim" onClick={close} />
      <aside className="cart__panel" role="dialog" aria-modal="true" aria-label="Cart" data-lenis-prevent="">
        <div className="cart__head">
          <p className="cart__title">
            <span className="shop-title__a">Cart</span>
            <span className="cart__count">[{count}]</span>
          </p>
          <button type="button" className="cart__close mono" onClick={close}>
            Close
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
        <p className="cart__ship">
          {missing > 0 ? (
            <>
              You’re only <strong>{formatPrice(missing)} away</strong> to get free shipping
            </>
          ) : (
            <strong>Your order ships free</strong>
          )}
        </p>

        {lines.length ? (
          <ul className="cart__lines">
            {lines.map(({ product, quantity }) => (
              <li key={product.slug} className="line">
                <PageLink href={`/products/${product.slug}`} className="line__thumb" onClick={close}>
                  <Image src={product.image} alt={product.name} width={256} height={256} unoptimized />
                </PageLink>
                <div className="line__info">
                  <p className="line__name">{product.name}</p>
                  <p className="line__code mono">{product.code}</p>
                  <Stepper small value={quantity} onChange={(value) => setQuantity(product.slug, value)} />
                </div>
                <button type="button" className="line__remove mono" onClick={() => remove(product.slug)}>
                  Remove
                </button>
                <p className="line__price">{formatPrice(product.price * quantity)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="cart__empty">
            <p>Your cart is empty</p>
            <p className="cart__empty-sub">Start adding products</p>
          </div>
        )}

        <div className={cx('cart__foot', !lines.length && 'cart__foot--empty')}>
          {lines.length > 0 && (
            <p className="cart__subtotal">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </p>
          )}
          {lines.length ? (
            <button type="button" className="shop-btn shop-btn--dark shop-btn--center mono" data-roll-host="">
              <RollText text="Proceed to checkout" />
              <ArrowIcon />
            </button>
          ) : (
            <PageLink
              href="/products"
              className="shop-btn shop-btn--dark shop-btn--center mono"
              data-roll-host=""
              onClick={close}
            >
              <RollText text="Buy it now" />
            </PageLink>
          )}
          <p className="cart__note mono">
            Taxes and{' '}
            <PageLink href="/terms-of-use#shipping" onClick={close}>
              shipping
            </PageLink>{' '}
            calculated at checkout
          </p>
        </div>
      </aside>
    </div>
  );
}
