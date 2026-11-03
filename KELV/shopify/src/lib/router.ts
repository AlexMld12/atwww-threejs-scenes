import { isDesignMode } from './design-mode';
import { backTarget, followPath, loadPage, normalizePath, scrollToHash, startLayers } from './page-layers';

const ownLink = (target: EventTarget | null) => {
  const link = (target as Element | null)?.closest?.<HTMLAnchorElement>('a[data-page-link]');
  if (!link || link.target || link.hasAttribute('download')) return null;
  const url = new URL(link.href);
  return url.origin === location.origin ? url : null;
};

/**
 * In-site links (`data-page-link`) move between the home and its layers without a reload. In the theme editor
 * they stay ordinary links: the editor previews one page at a time.
 */
export function startRouter() {
  if (isDesignMode()) return;
  startLayers();

  document.addEventListener('click', (event) => {
    const url = ownLink(event.target);
    if (!url || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const path = normalizePath(url.pathname);
    if (path === normalizePath(location.pathname)) {
      if (url.hash) {
        history.replaceState(null, '', url);
        scrollToHash();
      }
      return;
    }
    if (backTarget(path)) {
      history.back();
      return;
    }
    history.pushState(null, '', url);
    followPath(path);
  });

  // The page is fetched while the pointer is on its way to the click.
  const prefetch = (event: Event) => {
    const url = ownLink(event.target);
    if (url) void loadPage(normalizePath(url.pathname)).catch(() => {});
  };
  document.addEventListener('pointerover', prefetch, { passive: true });
  document.addEventListener('focusin', prefetch);
}
