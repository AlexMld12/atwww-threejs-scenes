'use client';

import { useState } from 'react';
import { PageLink } from '@/components/layers/PageLink';
import { cx } from '@/lib/css';

/** TAKE QUIZ / BUY NOW: the underline sweep always finishes, and a new hover restarts it. */
export function Cta({
  href,
  className,
  label,
  hidden,
}: {
  href: string;
  className: string;
  label: string;
  hidden?: boolean;
}) {
  const [sweeping, setSweeping] = useState(false);
  const play = () => {
    setSweeping(false);
    requestAnimationFrame(() => setSweeping(true));
  };

  return (
    <PageLink
      className={cx('cta mono', className)}
      href={href}
      tabIndex={hidden ? -1 : undefined}
      onMouseEnter={play}
      onFocus={play}
    >
      {label}
      <span
        className={cx('cta__line', sweeping && 'is-sweeping')}
        aria-hidden="true"
        onAnimationEnd={() => setSweeping(false)}
      />
    </PageLink>
  );
}
