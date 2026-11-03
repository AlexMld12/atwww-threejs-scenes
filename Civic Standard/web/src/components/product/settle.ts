// The product page's heavy parts below the hero (the showcase's product, the gallery's plates) wait until the hero has
// come in: started with it, their uploads and compiles took the frames of its entrance.
let settled: Promise<void> = Promise.resolve();
let release = () => {};

/** The hero, as it mounts: holds the others until `release` (it came in, or it went). */
export function holdForHero() {
  settled = new Promise((resolve) => (release = resolve));
  return () => release();
}

export const heroSettled = () => settled;

// Then one at a time, each in an idle moment: started together (the showcase, the pictures, the assembly), their
// contexts, uploads and compiles fell in the same frames, a stall of a fifth of a second.
let queue: Promise<unknown> = Promise.resolve();
const idle = () =>
  new Promise<void>((resolve) =>
    'requestIdleCallback' in window ? requestIdleCallback(() => resolve(), { timeout: 400 }) : setTimeout(resolve, 50),
  );

/** `build` after the hero and after the heavy parts queued before it; its promise settles when it is built. */
export function inTurn<T>(build: () => Promise<T>) {
  const start = queue.then(() => settled).then(idle);
  const turn = start.then(build);
  // one that never gets ready (a failed load) holds the others back no longer than this
  queue = start
    .then(() => Promise.race([turn, new Promise((resolve) => setTimeout(resolve, 5000))]))
    .catch(() => undefined);
  return turn;
}
