import EmblaCarousel from 'embla-carousel';
import { useEffect, type RefObject } from 'react';
import { designPx } from '@/lib/design';

const EDGE = 30;

// As the reference's slider (fluid.glass/about, Team): Embla with free dragging, no loop and no snapping after a
// throw; a fast throw past either end overshoots and springs back (Embla's edge bounds). The arrows move one card.
// Snaps sit on the page margin, not the screen's edge, so the first card starts where Figma has it.
export function useRange(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const section = root.current!;
    const embla = EmblaCarousel(section.querySelector<HTMLElement>('.range__viewport')!, {
      loop: false,
      align: () => designPx(EDGE),
      dragFree: true,
      skipSnaps: true,
      containScroll: 'trimSnaps',
    });
    const prev = section.querySelector<HTMLButtonElement>('.range__arrow--prev')!;
    const next = section.querySelector<HTMLButtonElement>('.range__arrow--next')!;
    const onPrev = () => embla.scrollPrev();
    const onNext = () => embla.scrollNext();
    prev.addEventListener('click', onPrev);
    next.addEventListener('click', onNext);

    // The arrow's icon leaves the way it points and comes back from the other side (their ArrowNav), once per hover.
    const nudge = (event: Event) => {
      const button = event.currentTarget as HTMLElement;
      const icon = button.querySelector('svg')!;
      if (icon.getAnimations().length) return;
      const away = button === prev ? -200 : 200;
      icon.animate(
        [
          { transform: 'translateX(0)', easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)' },
          { transform: `translateX(${away}%)`, offset: 0.5 },
          { transform: `translateX(${-away}%)`, offset: 0.5, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 1000 },
      );
    };
    [prev, next].forEach((button) => button.addEventListener('pointerenter', nudge));

    // Each card is uncovered as it comes into the frame (Embla says so at once, also mid-drag), from the moment the
    // slider itself has come in (85 %, as every reveal). Not by an IntersectionObserver on the card: its 85 % mark kept
    // the titles at the foot of the tall cards hidden, and a card dragged in waited for it.
    const viewport = section.querySelector<HTMLElement>('.range__viewport')!;
    const slides = embla.slideNodes();
    let shown = false;
    const uncover = () => {
      if (!shown) return;
      embla.slidesInView().forEach((index) => {
        slides[index].querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-in'));
      });
    };
    embla.on('slidesInView', uncover);
    const arrival = new IntersectionObserver(
      (entries) => {
        if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
        shown = true;
        uncover();
        arrival.disconnect();
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    arrival.observe(viewport);

    return () => {
      arrival.disconnect();
      embla.off('slidesInView', uncover);
      embla.destroy();
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      [prev, next].forEach((button) => button.removeEventListener('pointerenter', nudge));
    };
  }, [root]);
}
