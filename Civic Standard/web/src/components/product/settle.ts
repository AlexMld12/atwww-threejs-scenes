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
