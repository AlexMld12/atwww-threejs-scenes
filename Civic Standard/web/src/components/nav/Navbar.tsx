'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Roll } from '@/components/ui/Roll';
import { LOGO_PARTS, LOGO_VIEWBOX } from '@/lib/logo-outline';
import { openQuote, quoteItems, serverQuoteItems, subscribeQuote } from '@/lib/quote';
import { currentView, navigate, subscribe } from '@/lib/routes';
import { MobileMenu } from './MobileMenu';

const LINKS = ['Products', 'About', 'Sustainability'];

// Figma's arrow (Product CMS.pdf)
const BACK_ICON = 'M5.26 10.45 6.02 9.72 2.03 5.72h9.35V4.68H2.03L6.01.7 5.26-.05C3.34 1.87 1.86 3.36.02 5.2z';

/** QUOTE / n (CHECKOUT / n in the configurator): the quote list's configurations; it opens the list. */
function QuoteButton({ label }: { label: string }) {
  const count = useSyncExternalStore(subscribeQuote, quoteItems, serverQuoteItems).length;
  return (
    <button type="button" className="pill nav__quote" aria-label={`${label}, ${count} items`} onClick={openQuote}>
      <Roll key={count} text={`${label} / ${count}`} />
    </button>
  );
}

/** Under 1024 px: the menu's button, two lines that cross into an × while it is open. */
function Burger({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`pill pill--icon nav__burger${open ? ' is-open' : ''}`}
      aria-label={open ? 'Close the menu' : 'Open the menu'}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span />
      <span />
    </button>
  );
}

/** A product's page and the configurator have their own buttons: back, the products' list and the quote. */
function ProductLinks({ quote, burger }: { quote: string; burger: ReactNode }) {
  return (
    <nav className="nav__links" aria-label="Main">
      <button
        type="button"
        className="pill pill--icon nav__back"
        aria-label="Back"
        onClick={() => (window.history.length > 1 ? window.history.back() : navigate('products'))}
      >
        <svg viewBox="0 -0.05 11.4 10.5" aria-hidden="true">
          <path d={BACK_ICON} />
        </svg>
      </button>
      <button type="button" className="pill nav__list" aria-label="Products list" onClick={() => navigate('products')}>
        <Roll text="Products list" />
      </button>
      <QuoteButton label={quote} />
      {burger}
    </nav>
  );
}

export function Navbar() {
  const view = useSyncExternalStore(subscribe, currentView, () => currentView());
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  // another page: the menu is closed
  useEffect(() => subscribe(close), [close]);
  const burger = <Burger open={menu} onToggle={() => setMenu(!menu)} />;
  return (
    <>
      <MobileMenu open={menu} onClose={close} />
      <header className={`nav${view === 'configurator' ? ' nav--bare' : ''}${menu ? ' is-menu' : ''}`}>
        {/* On the home the logo reloads it, from the preloader; elsewhere it leads home. */}
        <Link
          className="nav__brand"
          href="/"
          aria-label="Civic Standard, home"
          onClick={(event) => {
            event.preventDefault();
            if (currentView() === 'home') window.location.reload();
            else navigate('home');
          }}
        >
          <svg className="nav__mark" viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`} aria-hidden="true">
            {LOGO_PARTS.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </svg>
          <span className="nav__rule" aria-hidden="true" />
          <span className="nav__word">Civic Standard</span>
        </Link>
        {view === 'product' || view === 'configurator' ? (
          <ProductLinks quote={view === 'configurator' ? 'Checkout' : 'Quote'} burger={burger} />
        ) : (
          <nav className="nav__links" aria-label="Main">
            {LINKS.map((label) => (
              <button
                key={label}
                type="button"
                className="pill"
                aria-label={label}
                onClick={label === 'Products' ? () => navigate('products') : undefined}
              >
                <Roll text={label} />
              </button>
            ))}
            <button type="button" className="pill pill--icon nav__search" aria-label="Search">
              <svg viewBox="0 0 14.4 14.4" aria-hidden="true">
                <circle cx="6.1" cy="6.1" r="5.35" />
                <path d="M10 10l3.9 3.9" />
              </svg>
            </button>
            <QuoteButton label="Quote" />
            {burger}
          </nav>
        )}
      </header>
    </>
  );
}
