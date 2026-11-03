import { KelvElement } from '@/lib/element';

const REVEAL_CLASSES = ['rv-ready', 'rv', 'rv--blur', 'is-in'];

/** A revealed, inert copy of the hero (`#hero`) after the footer, for the seamless loop back to the top. */
export class Loop extends KelvElement {
  protected mount() {
    const host = this.querySelector('.loop')!;
    const copy = () => {
      const hero = document.getElementById('hero');
      if (hero) host.replaceChildren(heroCopy(hero));
    };
    copy();
    // The theme editor re-renders the hero when one of its settings changes.
    this.listen(document, 'shopify:section:load', copy);
  }
}

function heroCopy(hero: HTMLElement) {
  const section = hero.cloneNode(true) as HTMLElement;
  section.removeAttribute('id');
  for (const element of section.querySelectorAll<HTMLElement>('[data-reveal]')) {
    // A paragraph already split into its lines goes back to plain text.
    const lines = [...element.querySelectorAll('.rv-line')];
    if (lines.length) element.textContent = lines.map((line) => line.textContent).join(' ');
    element.removeAttribute('data-reveal');
    element.removeAttribute('data-reveal-delay');
    element.removeAttribute('data-reveal-text');
    element.classList.remove(...REVEAL_CLASSES);
    element.style.removeProperty('--rv-delay');
  }
  section.querySelector('[fetchpriority]')?.removeAttribute('fetchpriority');
  // The title is the page's heading only once.
  const title = section.querySelector('h1');
  if (title) {
    const paragraph = document.createElement('p');
    for (const { name, value } of title.attributes) paragraph.setAttribute(name, value);
    paragraph.append(...title.childNodes);
    title.replaceWith(paragraph);
  }
  return section;
}
