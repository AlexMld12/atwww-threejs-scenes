'use client';

import { useEffect, useRef } from 'react';

/** The JOIN CLUB / BUY NOW underline sweep, for any `.sweep` link: it runs on hover and always finishes. */
export function SweepLine() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const line = ref.current;
    const host = line?.parentElement;
    if (!line || !host) return;
    const play = () => {
      line.classList.remove('is-sweeping');
      requestAnimationFrame(() => line.classList.add('is-sweeping'));
    };
    const done = () => line.classList.remove('is-sweeping');
    host.addEventListener('mouseenter', play);
    host.addEventListener('focus', play);
    line.addEventListener('animationend', done);
    return () => {
      host.removeEventListener('mouseenter', play);
      host.removeEventListener('focus', play);
      line.removeEventListener('animationend', done);
    };
  }, []);
  return <span ref={ref} className="cta__line sweep__line" aria-hidden="true" />;
}
