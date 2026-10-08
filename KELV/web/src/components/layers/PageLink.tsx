'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { backTarget } from '@/lib/page-layers';

/** In-site link: goes Back when the target is the page below the current layer, so history stays tidy. */
export function PageLink({ href, onClick, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const go = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (backTarget(href)) router.back();
    else router.push(href, { scroll: false });
  };
  return <Link href={href} scroll={false} onClick={go} {...rest} />;
}
