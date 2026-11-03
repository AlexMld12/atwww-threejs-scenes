/** Small DOM builders for the quiz screens, which are drawn from the quiz logic (src/analysis/logic.ts). */

type Child = Node | string | null | false | undefined;
type Attributes = Record<string, string | number | boolean | null | undefined>;

/** `<tag class="…" …>children</tag>`; `false` / `null` attributes are left out, `true` is a bare attribute. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (name === 'style') element.style.cssText = String(value);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
  element.append(...children.filter((child): child is Node | string => Boolean(child)));
  return element;
}

const STAGGER = 0.06;
const MAX_STEPS = 12;

/** Staggered `--d` delays for the `[data-sa-in]` items of one screen, in render order. */
export function cascade(delay: number) {
  let index = 0;
  return () => `--d: ${(delay + Math.min(index++, MAX_STEPS) * STAGGER).toFixed(2)}s`;
}

/** Adds `is-revealed` two frames on, once the hidden state has painted. */
export function revealSoon(...elements: Element[]) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const element of elements) element.classList.add('is-revealed');
    }),
  );
}

/** A label that rolls up letter by letter on hover (`.roll` in ui.css; the host carries `data-roll-host`). */
export function rollText(text: string) {
  const letters = [...text];
  const roll = el('span', { class: 'roll', 'aria-hidden': 'true' });
  letters.forEach((letter, i) => {
    const glyph = letter === ' ' ? ' ' : letter;
    roll.append(
      el(
        'span',
        { class: 'roll__ch', style: `--i: ${i}; --ri: ${letters.length - 1 - i}` },
        el('span', {}, glyph),
        el('span', {}, glyph),
      ),
    );
  });
  return [roll, el('span', { class: 'sr-only' }, text)];
}

/** A copy of an icon the section keeps in a `<template data-icon="name">`. */
export function icon(root: ParentNode, name: string) {
  const template = root.querySelector<HTMLTemplateElement>(`template[data-icon="${name}"]`);
  return template ? (template.content.firstElementChild!.cloneNode(true) as Element) : null;
}

export function button(
  variant: 'primary' | 'blue' | 'ghost',
  label: string,
  onClick: () => void,
  options: { className?: string; arrow?: Element | null; disabled?: boolean } = {},
) {
  const classes = ['sa-btn', `sa-btn--${variant}`, options.className].filter(Boolean).join(' ');
  const element = el(
    'button',
    { class: classes, type: 'button', disabled: options.disabled, 'data-roll-host': true },
    ...rollText(label),
    options.arrow,
  );
  element.addEventListener('click', onClick);
  return element;
}
