import Link from 'next/link';
import { cx } from '@/lib/css';
import { ArrowIcon, Logo } from '@/components/ui/icons';
import { RollText } from '@/components/ui/RollText';
import { Cta } from './Cta';
import { Ticks } from './Ticks';

/**
 * The fixed header + CTAs. Rendered twice: white, and a dark copy clipped to the part of
 * the screen over light sections (`--lb-a` / `--lb-b`, useLightBand), so the colour
 * changes exactly where a section edge crosses the text. mix-blend-mode would give
 * off-white on navy and random colours over images.
 */
export function Chrome({ dark = false }: { dark?: boolean }) {
  const tabIndex = dark ? -1 : undefined;
  return (
    <div className={cx('chrome', dark && 'chrome--dark')} aria-hidden={dark || undefined}>
      <header className="site-header">
        <Ticks />
        <div className="head-row">
          <Link className="logo" href="/" aria-label="KELV — home" tabIndex={tabIndex}>
            <Logo />
          </Link>
          <p className="head-title">
            <span className="head-title__a">Foam</span>
            <span className="head-title__b">Cleanser</span>
          </p>
          <Link className="btn-shop" href="/skin-analysis" scroll={false} data-roll-host="" tabIndex={tabIndex}>
            <RollText text="Open shop" />
            <ArrowIcon />
          </Link>
        </div>
      </header>
      <Cta className="cta--l" href="#club" label="Join club" hidden={dark} />
      <Cta className="cta--r" href="#shop" label="Buy now" hidden={dark} />
    </div>
  );
}
