import { PageLink } from '@/components/layers/PageLink';
import { cx } from '@/lib/css';
import { ArrowIcon, Logo } from '@/components/ui/icons';
import { RollText } from '@/components/ui/RollText';
import { Cta } from './Cta';
import { Ticks } from './Ticks';

/** Fixed header + CTAs; the dark copy is clipped to the light sections (useLightBand). */
export function Chrome({ dark = false }: { dark?: boolean }) {
  const tabIndex = dark ? -1 : undefined;
  return (
    <div className={cx('chrome', dark && 'chrome--dark')} aria-hidden={dark || undefined}>
      <header className="site-header">
        <Ticks />
        <div className="head-row">
          <PageLink className="logo" href="/" aria-label="KELV — home" tabIndex={tabIndex}>
            <Logo />
          </PageLink>
          <p className="head-title">
            <span className="head-title__a">Skin</span>
            <span className="head-title__b">Collection</span>
          </p>
          <PageLink className="btn-shop" href="/products" data-roll-host="" tabIndex={tabIndex}>
            <RollText text="Open shop" />
            <ArrowIcon />
          </PageLink>
        </div>
      </header>
      <Cta className="cta--l" href="/skin-analysis" label="Take quiz" hidden={dark} />
      <Cta className="cta--r" href="/products" label="Buy now" hidden={dark} />
    </div>
  );
}
