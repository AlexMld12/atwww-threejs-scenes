import { KelvElement } from '@/lib/element';

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * A policy page (Settings → Policies), which Shopify renders with its own markup: rebuilt as the shop's legal
 * page. Each heading of the policy opens a numbered section; plain paragraphs are revealed line by line.
 */
export class Policy extends KelvElement {
  protected mount() {
    const container = this.querySelector('.shopify-policy__container');
    if (!container) return;
    const title = container.querySelector('.shopify-policy__title')?.textContent?.trim() ?? '';
    const body =
      container.querySelector('.shopify-policy__body .rte') ?? container.querySelector('.shopify-policy__body');

    const article = document.createElement('article');
    article.className = 'legal';
    const head = document.createElement('header');
    head.className = 'legal__head';
    const h1 = document.createElement('h1');
    h1.className = 'legal__title';
    h1.dataset.reveal = 'blur';
    h1.textContent = title;
    head.append(h1);
    const updated = this.querySelector('[data-part="updated"]');
    if (updated) head.append(updated);
    article.append(head);

    let section: HTMLElement | null = null;
    let sectionBody: HTMLElement | null = null;
    let count = 0;
    let index = 0;
    const open = (heading?: Element) => {
      section = document.createElement('section');
      section.className = 'legal__section';
      if (heading) {
        const text = heading.textContent?.trim() ?? '';
        section.id = slug(text);
        const h2 = document.createElement('h2');
        h2.className = 'legal__heading mono';
        h2.dataset.reveal = '';
        const number = document.createElement('span');
        number.className = 'dim';
        number.textContent = String(++count).padStart(2, '0');
        h2.append(number, ` ${text}`);
        section.append(h2);
      }
      sectionBody = document.createElement('div');
      sectionBody.className = 'legal__body';
      section.append(sectionBody);
      article.append(section);
      index = 0;
    };

    // Shopify's generated policies wrap the text in plain divs: unwrapped, so their headings still open sections.
    const blocks = (parent: Element): Element[] =>
      [...parent.children].flatMap((node) => (/^(DIV|SECTION)$/.test(node.tagName) ? blocks(node) : [node]));

    for (const node of body ? blocks(body) : []) {
      if (/^H[1-4]$/.test(node.tagName)) {
        open(node);
        continue;
      }
      if (!sectionBody) open();
      const element = node as HTMLElement;
      if (element.tagName === 'P') element.classList.add('legal__para');
      // Line by line only for plain text: splitting would drop links and emphasis.
      element.dataset.reveal = element.tagName === 'P' && !element.children.length ? 'lines' : '';
      element.dataset.revealDelay = String(0.05 + index++ * 0.05);
      sectionBody!.append(element);
    }

    const other = this.querySelector('[data-part="other"]');
    if (other) article.append(other);
    container.replaceWith(article);
  }
}
