import Image from 'next/image';
import type { Ref } from 'react';
import { Mega } from '@/components/ui/Mega';
import { Reveal } from '@/components/ui/Reveal';

const POLICIES = [
  { href: '#privacy', label: 'Privacy policy' },
  { href: '#refund', label: 'Refund policy' },
  { href: '#shipping', label: 'Shipping policy' },
  { href: '#terms', label: 'Terms of use' },
];

export function Footer({ ref }: { ref?: Ref<HTMLElement> }) {
  return (
    <footer ref={ref} className="footer" id="footer">
      <Image
        className="footer__glow"
        src="/images/hero-glow.webp"
        alt=""
        width={2602}
        height={2210}
        loading="eager"
        aria-hidden
      />
      <Mega className="footer__mega" />
      <Reveal className="footer__info mono" delay={0.2} lines>
        Three steps back to baseline. Three steps back to baseline.
      </Reveal>
      <Reveal as="nav" className="footer__bar mono" delay={0.3} aria-label="Footer">
        <a href="#contacts">Contacts</a>
        <span className="footer__policies">
          {POLICIES.map((policy) => (
            <a key={policy.href} href={policy.href}>
              {policy.label}
            </a>
          ))}
        </span>
        <span className="footer__credit">
          <span className="footer__by">Website by</span>{' '}
          <a href="https://www.atwww.studio/" target="_blank" rel="noopener">
            ATWWW
          </a>
        </span>
      </Reveal>
    </footer>
  );
}
