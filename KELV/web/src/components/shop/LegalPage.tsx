'use client';

import { PageLink } from '@/components/layers/PageLink';
import { Reveal } from '@/components/ui/Reveal';
import type { LegalDoc } from '@/shop/legal';

/** Privacy policy / terms of use: no Figma frame, built from the shop's type and rules. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <article className="legal">
      <header className="legal__head">
        <Reveal as="h1" className="legal__title" fx="blur">
          {doc.heading}
        </Reveal>
        <Reveal className="legal__meta mono" delay={0.1}>
          Last updated <span className="dim">[{doc.updated}]</span>
        </Reveal>
      </header>
      {doc.sections.map((section, i) => (
        <section key={section.id} id={section.id} className="legal__section">
          <Reveal as="h2" className="legal__heading mono">
            <span className="dim">{String(i + 1).padStart(2, '0')}</span> {section.title}
          </Reveal>
          <div className="legal__body">
            {section.paragraphs.map((paragraph, j) => (
              <Reveal key={j} className="legal__para" delay={0.05 + j * 0.05} lines>
                {paragraph}
              </Reveal>
            ))}
          </div>
        </section>
      ))}
      <Reveal className="legal__other mono">
        {doc.path === '/privacy-policy' ? (
          <PageLink href="/terms-of-use" className="sweep">
            Read the terms of use
          </PageLink>
        ) : (
          <PageLink href="/privacy-policy" className="sweep">
            Read the privacy policy
          </PageLink>
        )}
      </Reveal>
    </article>
  );
}
