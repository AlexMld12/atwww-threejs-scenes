import type { CSSVars } from '@/lib/css';

/** Button label that rolls up letter by letter on hover (styles: `.roll` in ui.css). */
export function RollText({ text }: { text: string }) {
  const letters = [...text];
  return (
    <>
      <span className="roll" aria-hidden="true">
        {letters.map((letter, i) => {
          const glyph = letter === ' ' ? ' ' : letter;
          const style: CSSVars = { '--i': i, '--ri': letters.length - 1 - i };
          return (
            <span key={i} className="roll__ch" style={style}>
              <span>{glyph}</span>
              <span>{glyph}</span>
            </span>
          );
        })}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
