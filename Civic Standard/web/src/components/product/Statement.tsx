'use client';

import { Fragment, useEffect, useRef, type CSSProperties } from 'react';

// The statement fills with the scroll, letter by letter (Figma shows it half way: the first words full, the rest at
// 15 %): it starts as its top reaches 85 % of the screen and is full when its foot reaches 45 %. A letter takes 6 %
// of the way to fill, so a few are always on their way.
const START = 0.85;
const END = 0.45;

export function Statement({ text, className }: { text: string; className: string }) {
  const root = useRef<HTMLParagraphElement>(null);
  const words = text.split(' ');
  const count = words.join('').length;
  // each word with the index of its first letter in the whole statement
  const starts = words.map((_, i) => words.slice(0, i).join('').length);

  useEffect(() => {
    const element = root.current!;
    let frame = 0;
    const update = () => {
      frame = 0;
      const { top, bottom } = element.getBoundingClientRect();
      const height = window.innerHeight;
      const progress = (START * height - top) / (START * height - END * height + (bottom - top));
      element.style.setProperty('--fill', String(Math.min(1, Math.max(0, progress))));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <p ref={root} className={`statement ${className}`} aria-label={text}>
      {words.map((word, i) => (
        // the space stays outside the word's box, where the line can break and keep it
        <Fragment key={i}>
          <span className="statement__word" aria-hidden="true">
            {[...word].map((letter, j) => (
              <span key={j} className="statement__letter" style={{ '--k': (starts[i] + j) / count } as CSSProperties}>
                {letter}
              </span>
            ))}
          </span>{' '}
        </Fragment>
      ))}
    </p>
  );
}
