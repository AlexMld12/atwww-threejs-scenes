'use client';

import { PageLink } from '@/components/layers/PageLink';
import { ArrowIcon, Logo } from '@/components/ui/icons';
import { RollText } from '@/components/ui/RollText';
import { useCart } from '@/shop/cart';

export function ShopHeader({ title: [a, b] }: { title: [string, string] }) {
  const { count, setOpen } = useCart();
  return (
    <header className="shop-head">
      <PageLink className="shop-logo" href="/" aria-label="KELV — home">
        <Logo degreeClassName="shop-deg" />
      </PageLink>
      <p className="shop-title">
        <span className="shop-title__a">{a}</span>
        <span className="shop-title__b">{b}</span>
      </p>
      <div className="shop-head__end">
        <button type="button" className="shop-cart-link mono" onClick={() => setOpen(true)}>
          Cart [ {count} ]
        </button>
        <PageLink className="btn-shop shop-quiz" href="/skin-analysis" data-roll-host="">
          <RollText text="Take quiz" />
          <ArrowIcon />
        </PageLink>
      </div>
    </header>
  );
}
