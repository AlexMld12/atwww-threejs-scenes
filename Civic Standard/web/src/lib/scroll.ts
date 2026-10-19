import Lenis from 'lenis';
import { onHandover } from './intro';

let lenis: Lenis | null = null;

/** One Lenis for the page, locked until the preloader is gone. */
export function startScroll() {
  if (lenis) return lenis;
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  lenis = new Lenis({ autoRaf: true });
  lenis.stop();
  onHandover(() => lenis?.start());
  return lenis;
}

export function scrollPosition() {
  return lenis?.scroll ?? window.scrollY;
}
