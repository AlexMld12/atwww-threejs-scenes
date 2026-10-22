import type { CSSProperties, ElementType } from 'react';

/** Figma's lines, each in its own mask: they rise into view one after another (details.css, use-reveal.ts). */
export function Lines({
  lines,
  className,
  style,
  as: Tag = 'p',
  enter,
}: {
  lines: string[];
  className: string;
  style?: CSSProperties;
  as?: ElementType;
  /** Plays when its top reaches this share of the screen (use-prefooter's trigger) instead of use-reveal's 85 %. */
  enter?: string;
}) {
  return (
    <Tag className={`lines ${className}`} style={style} data-reveal={enter ? undefined : 'lines'} data-enter={enter}>
      {lines.map((line, i) => (
        <span key={i} className="line" style={{ '--i': i } as CSSProperties}>
          <span className="line__inner">{line}</span>
        </span>
      ))}
    </Tag>
  );
}
