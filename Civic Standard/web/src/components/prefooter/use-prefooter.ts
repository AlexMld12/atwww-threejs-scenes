import { useEffect, type RefObject } from 'react';
import { clamp01, designPx } from '@/lib/design';
import { LAYOUT } from './content';

// As floema.com's footer (Footer.vue, its GSAP code read and measured): every [data-enter] block plays once when its
// top reaches data-enter × the screen's height (their own scroll check); the CSS (prefooter.css) runs the motion.
// The drawings drift sideways with the scroll (their scrubbed x, ease none): the benches from −43.2 px (3vw at 1440)
// to 0 over the first row's pass, the bin from 28.8 px (2vw) to 0 over the offices' row, the chair from −10 % to 10 %
// of its width while the links' row comes fully into view.
const BENCHES_FROM = -43.2;
const BIN_FROM = 28.8;
const CHAIR_SPAN = 0.1;

export function usePrefooter(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = root.current!;
    const observers = [...section.querySelectorAll<HTMLElement>('[data-enter]')].map((element) => {
      const at = Number(element.dataset.enter);
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
          element.classList.add('is-in');
          observer.disconnect();
        },
        { rootMargin: `0px 0px ${-(1 - at) * 100}% 0px` },
      );
      observer.observe(element);
      return observer;
    });

    const benches = section.querySelector<HTMLElement>('.pf__drawing--benches')!;
    const bin = section.querySelector<HTMLElement>('.pf__drawing--bin')!;
    const chair = section.querySelector<HTMLElement>('.pf__drawing--chair')!;
    const [firstRule, secondRule, thirdRule] = LAYOUT.rules;
    let visible = false;
    let frame = 0;
    const visibility = new IntersectionObserver((entries) => (visible = entries.at(-1)!.isIntersecting));
    visibility.observe(section);

    // a row's pass: 0 as its top comes in at the bottom, 1 as its bottom leaves at the top ("top bottom" → "bottom top")
    const pass = (top: number, from: number, to: number, screen: number) =>
      clamp01((screen - (top + designPx(from))) / (screen + designPx(to - from)));

    const update = () => {
      frame = requestAnimationFrame(update);
      if (!visible) return;
      const { top } = section.getBoundingClientRect();
      const screen = window.innerHeight;
      benches.style.transform = `translateX(${designPx(BENCHES_FROM) * (1 - pass(top, 0, firstRule, screen))}px)`;
      bin.style.transform = `translateX(${designPx(BIN_FROM) * (1 - pass(top, firstRule, secondRule, screen))}px)`;
      // "top 100%" → "bottom 100%": done once the links' row is all on screen
      const links = clamp01((screen - (top + designPx(secondRule))) / designPx(thirdRule - secondRule));
      chair.style.transform = `translateX(${(-CHAIR_SPAN + 2 * CHAIR_SPAN * links) * 100}%)`;
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      visibility.disconnect();
      observers.forEach((observer) => observer.disconnect());
    };
  }, [root]);
}
