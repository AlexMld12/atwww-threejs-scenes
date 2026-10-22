'use client';

import { useEffect, type CSSProperties } from 'react';
import { navigate } from '@/lib/routes';
import { setScrollLocked } from '@/lib/scroll';
import { MAIN_LINKS, SUB_LINKS } from '../prefooter/content';

// Under 1024 px the navbar's links move into a menu over the whole screen (floema.com's, measured on a phone): the
// paper, the main links large and rising in one after another, the footer's other links in two columns at the foot.
// It closes on a link, on the burger again, or on Escape. Only Products leads somewhere yet, as in the footer.
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    setScrollLocked(true);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      setScrollLocked(false);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const go = (label: string) => {
    if (label !== 'Products') return;
    onClose();
    navigate('products');
  };

  return (
    <div className={`mm${open ? ' is-open' : ''}`} inert={!open} aria-hidden={!open}>
      <nav className="mm__main" aria-label="Menu">
        {MAIN_LINKS.map((label, i) => (
          <button
            key={label}
            type="button"
            className="mm__link"
            style={{ '--i': i } as CSSProperties}
            onClick={() => go(label)}
          >
            <span className="mm__link-inner">{label}</span>
          </button>
        ))}
      </nav>
      <div className="mm__sub">
        {SUB_LINKS.map(({ links }) => (
          <ul key={links[0]} className="mm__column">
            {links.map((label) => (
              <li key={label}>
                <button type="button" className="mm__small">
                  {label}
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
