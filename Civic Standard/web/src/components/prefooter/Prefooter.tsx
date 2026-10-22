'use client';

import { useRef, type CSSProperties } from 'react';
import { designCss } from '@/lib/design';
import { navigate } from '@/lib/routes';
import { Lines } from '../details/Lines';
import { fromLeft, textTop } from '../details/place';
import { LAYOUT, LEGAL, MAIN_LINKS, OFFICES, SUB_LINKS } from './content';
import { usePrefooter } from './use-prefooter';

const DRAWINGS = ['benches', 'bin', 'chair'] as const;
const OFFICE_ROW = LAYOUT.rules[0];
const LINKS_ROW = LAYOUT.rules[1];

const order = (i: number) => ({ '--i': i }) as CSSProperties;

/** A footer link (only Products leads somewhere yet); underlined on hover. */
function FooterLink({ label, className, style }: { label: string; className: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      className={`pf__link ${className}`}
      style={style}
      onClick={label === 'Products' ? () => navigate('products') : undefined}
    >
      <span className="pf__label">{label}</span>
    </button>
  );
}

export function Prefooter() {
  const root = useRef<HTMLElement>(null);
  usePrefooter(root);

  return (
    <section ref={root} className="pf">
      {DRAWINGS.map((name) => {
        const { x, y, w, h } = LAYOUT.drawings[name];
        return (
          // eslint-disable-next-line @next/next/no-img-element -- line drawings from Figma, moved by use-prefooter
          <img
            key={name}
            className={`pf__drawing pf__drawing--${name}`}
            src={`/prefooter/${name}.svg`}
            alt=""
            style={{ left: fromLeft(x), top: designCss(y), width: designCss(w), height: designCss(h) }}
          />
        );
      })}

      {LAYOUT.rules.map((y, i) => (
        <span
          key={y}
          className={`pf__rule${i === 2 ? ' pf__rule--light' : ''}`}
          style={{ top: designCss(y) }}
          data-enter="0.98"
        />
      ))}

      {/* the offices' row: the blocks come up one after another as the row's top reaches 80 % of the screen */}
      <div
        className="pf__row"
        style={{ top: designCss(OFFICE_ROW), height: designCss(LINKS_ROW - OFFICE_ROW) }}
        data-enter="0.8"
      >
        {OFFICES.map(({ x, title, lines, socials }, i) => (
          <div
            key={title}
            className="pf__office"
            style={{ left: fromLeft(x), top: textTop('sans', LAYOUT.officeTitleBaseline - OFFICE_ROW, 18, 22) }}
          >
            <div className="pf__rise pf__rise--office" style={order(i)}>
              <h3 className="pf__title">{title}</h3>
              <p className="pf__address">
                {lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
              {socials && (
                <div className="pf__socials" data-enter="1">
                  {socials.map((name, k) => (
                    <button
                      key={name}
                      type="button"
                      className="pf__social pf__rise pf__rise--social"
                      style={order(k)}
                      aria-label={name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- the glyph from Figma */}
                      <img src={`/prefooter/${name.toLowerCase()}.svg`} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* the links' row: the main links, then 0.2 s on the smaller ones, as their sitemap */}
      <div
        className="pf__row"
        style={{ top: designCss(LINKS_ROW), height: designCss(LAYOUT.rules[2] - LINKS_ROW) }}
        data-enter="0.8"
      >
        <nav
          className="pf__main"
          aria-label="Footer"
          style={{ left: fromLeft(288.8), top: textTop('sans', LAYOUT.mainBaseline - LINKS_ROW, 18, 21) }}
        >
          {MAIN_LINKS.map((label, i) => (
            <FooterLink key={label} label={label} className="pf__link--main pf__rise pf__rise--main" style={order(i)} />
          ))}
        </nav>
        {SUB_LINKS.map(({ x, links }, column) => (
          <div
            key={x}
            className="pf__sub"
            style={{ left: fromLeft(x), top: textTop('sans', LAYOUT.subBaseline - LINKS_ROW, 14, 18) }}
          >
            {links.map((label, i) => (
              <FooterLink
                key={label}
                label={label}
                className="pf__link--sub pf__rise pf__rise--sub"
                style={order(column * links.length + i)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* not in floema's footer: the site's own line reveal, as it comes in at the page's foot */}
      {LEGAL.map((lines, i) => (
        <Lines
          key={i}
          lines={lines}
          className="pf__legal"
          style={{ top: textTop('sans', LAYOUT.legalBaselines[i], 14, 18), left: fromLeft(30) }}
          enter="0.98"
        />
      ))}
    </section>
  );
}
