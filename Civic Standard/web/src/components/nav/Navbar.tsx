'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LOGO_PARTS, LOGO_VIEWBOX } from '@/lib/logo-outline';

const LINKS = ['Products', 'About', 'Sustainability'];

/** On hover the label rolls up and out while a copy rolls in from below. */
function Roll({ children }: { children: ReactNode }) {
  return (
    <span className="roll">
      <span className="roll__face">{children}</span>
      <span className="roll__face roll__face--next" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 14.4 14.4" aria-hidden="true">
      <circle cx="6.1" cy="6.1" r="5.35" />
      <path d="M10 10l3.9 3.9" />
    </svg>
  );
}

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
          <button key={label} type="button" className="pill">
            <Roll>{label}</Roll>
          </button>
        ))}
        <button type="button" className="pill pill--icon nav__search" aria-label="Search">
          <Roll>
            <SearchIcon />
          </Roll>
        </button>
        <button type="button" className="pill">
          <Roll>Quote / 0</Roll>
        </button>
      </nav>
    </header>
  );
}
