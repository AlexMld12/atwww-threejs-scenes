'use client';

import Link from 'next/link';
import { Roll } from '@/components/ui/Roll';
import { LOGO_PARTS, LOGO_VIEWBOX } from '@/lib/logo-outline';

const LINKS = ['Products', 'About', 'Sustainability'];

export function Navbar() {
  return (
    <header className="nav">
      {/* Only the homepage exists yet: the logo reloads it, from the preloader. */}
      <Link
        className="nav__brand"
        href="/"
        aria-label="Civic Standard, home"
        onClick={(event) => {
          event.preventDefault();
          window.location.reload();
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
      <nav className="nav__links" aria-label="Main">
        {LINKS.map((label) => (
          <button key={label} type="button" className="pill" aria-label={label}>
            <Roll text={label} />
          </button>
        ))}
        <button type="button" className="pill pill--icon nav__search" aria-label="Search">
          <svg viewBox="0 0 14.4 14.4" aria-hidden="true">
            <circle cx="6.1" cy="6.1" r="5.35" />
            <path d="M10 10l3.9 3.9" />
          </svg>
        </button>
        <button type="button" className="pill" aria-label="Quote, 0 items">
          <Roll text="Quote / 0" />
        </button>
      </nav>
    </header>
  );
}
