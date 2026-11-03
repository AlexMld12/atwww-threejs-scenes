/** Opens or closes an `.acc` row (the height is animated in CSS through grid rows, no measuring). */
export function setOpen(row: Element, open: boolean) {
  row.classList.toggle('is-open', open);
  row.querySelector('.acc__head')?.setAttribute('aria-expanded', String(open));
}
