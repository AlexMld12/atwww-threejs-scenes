/** True inside Shopify's theme editor, which previews one page at a time and re-renders a section on each change. */
export const isDesignMode = () => Boolean((window as { Shopify?: { designMode?: boolean } }).Shopify?.designMode);
