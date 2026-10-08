'use client';

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';
import { cx, type CSSVars } from '@/lib/css';
import { useScroll } from '@/lib/scroll';

const LINE_STAGGER = 0.07;
const RESIZE_DEBOUNCE_MS = 150;

const RevealEnabled = createContext(true);

/** Renders its subtree in the final, revealed state (the hero copy at the end of the page). */
export function StaticReveals({ children }: { children: ReactNode }) {
  return <RevealEnabled.Provider value={false}>{children}</RevealEnabled.Provider>;
}

interface RevealProps {
  as?: ElementType;
  className?: string;
  /** Seconds before the element starts its reveal. */
  delay?: number;
  /** Reveal a paragraph line by line, as the browser wraps it. */
  lines?: boolean;
  /** `blur`: only blur → sharp, no movement (the big titles). */
  fx?: 'blur';
  children: ReactNode;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
}

/** Blur + rise reveal (drinksom: opacity 0, y 30, blur 4, 0.8 s), played once in view. */
export function Reveal({ as: Tag = 'p', className, delay = 0, lines = false, fx, children, ...rest }: RevealProps) {
  const enabled = useContext(RevealEnabled);
  const { ready } = useScroll();
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  const [rows, setRows] = useState<string[] | null>(null);

  useLayoutEffect(() => {
    if (!enabled || !lines || rows || !ref.current) return;
    const words = ref.current.querySelectorAll<HTMLElement>('[data-word]');
    const measured: string[][] = [];
    let top = Number.NaN;
    for (const word of words) {
      if (word.offsetTop !== top) {
        measured.push([]);
        top = word.offsetTop;
      }
      measured[measured.length - 1].push(word.textContent ?? '');
    }
    setRows(measured.map((row) => row.join(' ')));
  }, [enabled, lines, rows]);

  useEffect(() => {
    if (!enabled || !lines) return;
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRows(null), RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [enabled, lines]);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !ready || shown || !element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, ready, shown]);

  if (!enabled) {
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  const state = cx('rv', fx === 'blur' && 'rv--blur', shown && 'is-in');

  if (!lines) {
    const style: CSSVars = { '--rv-delay': `${delay}s` };
    return (
      <Tag ref={ref} data-reveal="" className={cx(className, 'rv-ready', state)} style={style} {...rest}>
        {children}
      </Tag>
    );
  }

  const text = String(children);
  return (
    <Tag ref={ref} data-reveal="" className={cx(className, rows && 'rv-ready')} {...rest}>
      {rows
        ? rows.map((row, i) => {
            const style: CSSVars = { '--rv-delay': `${delay + i * LINE_STAGGER}s` };
            return (
              <span key={i} className={cx('rv-line', state)} style={style}>
                {row}
              </span>
            );
          })
        : text.split(' ').map((word, i) => (
            <Fragment key={i}>
              <span data-word="" style={{ display: 'inline-block' }}>
                {word}
              </span>{' '}
            </Fragment>
          ))}
    </Tag>
  );
}
