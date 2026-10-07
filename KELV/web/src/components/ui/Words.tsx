import { Fragment } from 'react';

/** Each word in its own clipped window, so it can slide in and out (`.sw-*` in pillars.css). */
export function Words({ text }: { text: string }) {
  const words = text.split(' ');
  return words.map((word, i) => (
    <Fragment key={i}>
      <span className="sw-win">
        <span className="sw-in">{word}</span>
      </span>
      {i < words.length - 1 && ' '}
    </Fragment>
  ));
}

/** Same as <Words>, one window per line (`\n`). */
export function Lines({ text }: { text: string }) {
  return text.split('\n').map((line, i) => (
    <span key={i} className="sw-win sw-win--line">
      <span className="sw-in">{line}</span>
    </span>
  ));
}
