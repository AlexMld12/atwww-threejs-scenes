'use client';

import { useRef } from 'react';
import { textTop } from '../details/place';
import { useReveal } from '../details/use-reveal';
import { kindOf, PICTURES, statement, STORY, type Page } from './content';
import { Picture } from './Picture';
import { Statement } from './Statement';

// Motion: the label rises in its mask as it comes into view (85 %), the statement fills letter by letter with the
// scroll (Statement.tsx), the pictures are uncovered from below while they settle from a little nearer.
export function ProductStory({ page }: { page: Page }) {
  const root = useRef<HTMLElement>(null);
  useReveal(root);

  return (
    <section ref={root} className="ps">
      <p
        className="ps__label lines"
        data-reveal="lines"
        style={{ top: textTop('mono', STORY.labelBaseline, 12, 16.3) }}
      >
        <span className="line">
          <span className="line__inner">The {kindOf(page)}</span>
        </span>
      </p>
      <Statement className="ps__statement" text={statement(page)} />
      <div className="ps__pictures">
        {PICTURES.map((view) => (
          <Picture key={view} product={page.id} view={view} className={`ps__picture ps__picture--${view}`} />
        ))}
      </div>
    </section>
  );
}
