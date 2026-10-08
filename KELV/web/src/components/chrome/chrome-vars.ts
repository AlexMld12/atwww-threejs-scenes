// Set on the two .chrome layers, not on <html>, so a change restyles only the header.
export function setChromeVar(name: string, value: string | null) {
  for (const layer of document.querySelectorAll<HTMLElement>('.chrome')) {
    if (value === null) layer.style.removeProperty(name);
    else layer.style.setProperty(name, value);
  }
}
