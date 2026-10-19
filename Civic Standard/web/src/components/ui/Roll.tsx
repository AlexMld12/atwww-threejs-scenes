import type { CSSProperties } from 'react';

/**
 * A label that rolls on hover, letter by letter from the last one: each letter goes up and out while its copy comes
 * in from below; on hover out the same runs backwards. The button carries the label for screen readers.
 */
export function Roll({ text }: { text: string }) {
  const letters = [...text];
  return (
    <span className="roll" style={{ '--n': letters.length } as CSSProperties} aria-hidden="true">
      {letters.map((letter, i) => (
        <span key={i} className="roll__letter" style={{ '--i': i } as CSSProperties}>
          <span className="roll__face">{letter === ' ' ? ' ' : letter}</span>
          <span className="roll__face roll__face--next">{letter === ' ' ? ' ' : letter}</span>
        </span>
      ))}
    </span>
  );
}
