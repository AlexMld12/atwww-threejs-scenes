import { whenBooted, whenReady } from '@/lib/scroll';

/**
 * Blur + rise reveal (drinksom: opacity 0, y 30, blur 4, 0.8 s), played once in view, for every `[data-reveal]`:
 *   data-reveal            the element as a whole
 *   data-reveal="lines"    a paragraph line by line, as the browser wraps it
 *   data-reveal="blur"     only blur → sharp, no movement (the big titles)
 *   data-reveal-delay="s"  seconds before it starts
 */

const LINE_STAGGER = 0.07;
const RESIZE_DEBOUNCE_MS = 150;

interface Reveal {
  element: HTMLElement;
  delay: number;
  lines: boolean;
  text: string;
  shown: boolean;
}

/** Splits a paragraph into its rendered lines: each word is measured where the browser puts it. */
function splitLines(reveal: Reveal) {
  const { element, text } = reveal;
  element.classList.remove('rv-ready');
  element.replaceChildren(
    ...text.split(' ').flatMap((word, i) => {
      const span = document.createElement('span');
      span.style.display = 'inline-block';
      span.textContent = word;
      return i ? [' ', span] : [span];
    }),
  );
  const rows: string[][] = [];
  let top = Number.NaN;
  for (const word of element.querySelectorAll('span')) {
    if (word.offsetTop !== top) {
      rows.push([]);
      top = word.offsetTop;
    }
    rows[rows.length - 1].push(word.textContent ?? '');
  }
  element.replaceChildren(
    ...rows.map((row, i) => {
      const line = document.createElement('span');
      line.className = reveal.shown ? 'rv-line rv is-in' : 'rv-line rv';
      line.style.setProperty('--rv-delay', `${reveal.delay + i * LINE_STAGGER}s`);
      line.textContent = row.join(' ');
      return line;
    }),
  );
  element.classList.add('rv-ready');
}

function show(reveal: Reveal) {
  reveal.shown = true;
  const targets = reveal.lines ? reveal.element.querySelectorAll('.rv') : [reveal.element];
  for (const target of targets) target.classList.add('is-in');
}

/** Puts the reveals inside `root` back in their hidden state at once, to play them again. */
export function resetReveals(root: HTMLElement) {
  for (const element of root.querySelectorAll<HTMLElement>('[data-reveal]')) {
    for (const target of [element, ...element.querySelectorAll<HTMLElement>('.rv')]) {
      target.style.transition = 'none';
      target.classList.remove('is-in');
    }
  }
  // One style flush with the transitions off, so nothing animates back.
  root.getBoundingClientRect();
  for (const element of root.querySelectorAll<HTMLElement>('[data-reveal], [data-reveal] .rv')) {
    element.style.transition = '';
  }
}

/** Starts the reveals inside `root`; `delay` is added to all of them (a page layer still sliding in). */
export function observeReveals(root: ParentNode, delay = 0) {
  const reveals: Reveal[] = [...root.querySelectorAll<HTMLElement>('[data-reveal]')].map((element) => ({
    element,
    delay: Number(element.dataset.revealDelay ?? 0) + delay,
    lines: element.dataset.reveal === 'lines',
    // Kept on the element: once split into lines, its textContent loses the spaces between them.
    text: (element.dataset.revealText ??= element.textContent?.trim().replace(/\s+/g, ' ') ?? ''),
    shown: false,
  }));
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: IntersectionObserver | undefined;

  const splitAll = () => {
    for (const reveal of reveals) if (reveal.lines) splitLines(reveal);
  };
  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(splitAll, RESIZE_DEBOUNCE_MS);
  };

  // Lines are measured with the fonts in.
  whenBooted(() => {
    if (disposed) return;
    // The hidden state is applied at once: with the transitions on, the text would fade out before it fades in.
    const plain = reveals.filter((reveal) => !reveal.lines).map((reveal) => reveal.element);
    for (const element of plain) {
      element.style.transition = 'none';
      element.classList.add('rv-ready', 'rv');
      if (element.dataset.reveal === 'blur') element.classList.add('rv--blur');
      element.style.setProperty('--rv-delay', `${reveals.find((r) => r.element === element)!.delay}s`);
    }
    plain[0]?.getBoundingClientRect();
    for (const element of plain) element.style.transition = '';
    splitAll();
    window.addEventListener('resize', onResize);
  });

  whenReady(() => {
    if (disposed) return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const reveal = reveals.find((r) => r.element === entry.target);
          if (reveal) show(reveal);
          observer!.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );
    for (const reveal of reveals) observer.observe(reveal.element);
  });

  return () => {
    disposed = true;
    clearTimeout(timer);
    observer?.disconnect();
    window.removeEventListener('resize', onResize);
  };
}
