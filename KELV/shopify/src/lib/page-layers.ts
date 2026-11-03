import { invalidateLayout } from './layout';
import { getLenis, setLoop, whenReady } from './scroll';

/**
 * Pages that live in the same document as the home and slide over it (no reload, the home keeps its state).
 * Shopify renders whichever page is asked for; a link inside the site fetches the next page, moves its layer's
 * content into this document and plays the transition. The layer of a page is its `<html data-page>`.
 */
export type LayerId = 'sa' | 'shop';

interface Page {
  layer: LayerId | null;
  title: string;
  /** The layer panel's markup, from Shopify's render of the page. */
  html: string;
}

interface Entry {
  layer: LayerId | null;
  path: string;
  /** Navigated inside the layer: Back no longer leads to the entry below. */
  moved: boolean;
}

const DURATION_MS = 1000;
const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
const SCRIM_OPACITY = 0.7;
const ENTER_DELAY = 0.4;
const DIRECT_ENTRY_DELAY = 0.1;
// A link inside a layer: the content fades out, is swapped at the top of the page, then plays its entrance.
const SWAP_MS = 350;

const pages = new Map<string, Promise<Page>>();
const saved = new Map<LayerId | null, number>();
let stack: Entry[] = [];
let wanted: string | null = null;
let busy = false;

export const normalizePath = (pathname: string) => pathname.replace(/\/$/, '') || '/';

const panelOf = (layer: LayerId) => document.querySelector<HTMLElement>(`[data-layer="${layer}"]`)!;

/** True while a layer is the page (the home is hidden under it). */
export const isLayerPage = () => Boolean(document.documentElement.dataset.page);

/** Tells the layer's content to play its entrance, `delay` seconds from now. */
function enter(layer: LayerId, delay: number) {
  panelOf(layer).dispatchEvent(new CustomEvent('kelv:layer-enter', { bubbles: true, detail: { delay } }));
}

/** The page at `path`, fetched once (a link hovered before the click is already on its way). */
export function loadPage(path: string) {
  let page = pages.get(path);
  if (!page) {
    page = fetchPage(path);
    pages.set(path, page);
    page.catch(() => pages.delete(path));
  }
  return page;
}

async function fetchPage(path: string): Promise<Page> {
  const response = await fetch(path, { headers: { Accept: 'text/html' } });
  if (!response.ok && response.status !== 404) throw new Error(`${path}: ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const layer = (doc.documentElement.dataset.page as LayerId | undefined) ?? null;
  return {
    layer,
    title: doc.title,
    html: layer ? (doc.querySelector(`[data-layer="${layer}"]`)?.innerHTML ?? '') : '',
  };
}

/** The stack starts from the page Shopify rendered; its layer's entrance plays when the page is revealed. */
export function startLayers() {
  const path = normalizePath(location.pathname);
  const layer = (document.documentElement.dataset.page as LayerId | undefined) ?? null;
  stack = [{ layer: null, path: '/', moved: false }];
  if (layer) {
    stack.push({ layer, path, moved: false });
    panelOf(layer).dataset.path = path;
    setLoop(false);
    whenReady(() => {
      enter(layer, DIRECT_ENTRY_DELAY);
      scrollToHash();
    });
  } else {
    pages.set('/', Promise.resolve({ layer: null, title: document.title, html: '' }));
  }
  window.addEventListener('popstate', () => followPath(location.pathname));
}

/** Brings the layer stack in line with the URL; Back may be pressed mid-transition, so it loops. */
export function followPath(pathname: string) {
  wanted = normalizePath(pathname);
  void sync();
}

const HASH_OFFSET = -120;

/** `/policies/privacy-policy#marketing-emails`: the section is scrolled to once the page is in place. */
export function scrollToHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  const lenis = getLenis();
  if (!target || !lenis || !isLayerPage()) return;
  // The page may have grown since Lenis measured it (fonts, the policy rebuilt into sections).
  lenis.resize();
  lenis.scrollTo(target, { offset: HASH_OFFSET, duration: 1 });
}

/** Where a click on an in-site link should go: Back when it is the page below, so history stays tidy. */
export function backTarget(pathname: string) {
  const path = normalizePath(pathname);
  const top = stack[stack.length - 1];
  const below = stack[stack.length - 2];
  return Boolean(top && below && !top.moved && below.path === path);
}

async function sync() {
  const lenis = getLenis();
  if (busy || !lenis) return;
  busy = true;
  try {
    while (wanted) {
      const path = wanted;
      const page = await loadPage(path);
      if (wanted !== path) continue;
      document.title = page.title;
      const top = stack[stack.length - 1];
      if (page.layer === top.layer) {
        if (page.layer && path !== top.path) {
          await swap(page.layer, path, page);
          Object.assign(top, { path, moved: true });
        }
        if (wanted === path) wanted = null;
        continue;
      }
      const index = stack.findIndex((entry) => entry.layer === page.layer);
      if (index >= 0) {
        await uncover(top.layer!, page.layer);
        stack = stack.slice(0, index + 1);
        if (page.layer && stack[index].path !== path) {
          await swap(page.layer, path, page);
          stack[index].moved = true;
        }
        stack[index].path = path;
      } else {
        fill(page.layer!, path, page);
        await cover(top.layer, page.layer!);
        stack.push({ layer: page.layer, path, moved: false });
      }
    }
  } catch {
    // The page could not be fetched: it is loaded the ordinary way.
    if (wanted) location.assign(wanted);
  } finally {
    busy = false;
  }
}

/** Puts the page's content in its layer, unless the layer already shows it (the quiz keeps its answers). */
function fill(layer: LayerId, path: string, page: Page) {
  const panel = panelOf(layer);
  if (panel.dataset.path === path) return;
  panel.innerHTML = page.html;
  panel.dataset.path = path;
}

/** Another page of the layer that is on screen: fade out, swap at the top, entrance. */
async function swap(layer: LayerId, path: string, page: Page) {
  const panel = panelOf(layer);
  const main = panel.querySelector('[data-layer-main]');
  main?.classList.add('is-leaving');
  await new Promise((resolve) => setTimeout(resolve, main ? SWAP_MS : 0));
  fill(layer, path, page);
  getLenis()?.scrollTo(0, { immediate: true, force: true });
  invalidateLayout();
  enter(layer, 0);
  scrollToHash();
}

function animate(panel: HTMLElement, opening: boolean) {
  const scrim = document.querySelector<HTMLElement>('.layer-scrim');
  const clip = [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }];
  const dim = [{ opacity: 0 }, { opacity: SCRIM_OPACITY }];
  const timing = { duration: DURATION_MS, easing: EASE, fill: 'both' as const };
  const slide = panel.animate(opening ? clip : clip.reverse(), timing);
  const fade = scrim?.animate(opening ? dim : dim.reverse(), timing);
  return {
    finished: slide.finished.catch(() => {}),
    cancel() {
      slide.cancel();
      fade?.cancel();
    },
  };
}

function setPage(layer: LayerId | null) {
  const html = document.documentElement;
  if (layer) html.dataset.page = layer;
  else delete html.dataset.page;
  invalidateLayout();
}

/** The new layer slides up over the current page (the home or another layer). */
async function cover(from: LayerId | null, to: LayerId) {
  const lenis = getLenis()!;
  const panel = panelOf(to);
  const html = document.documentElement;
  saved.set(from, window.scrollY);
  lenis.stop();
  html.classList.add('layer-anim');
  panel.classList.add('is-moving');
  panel.scrollTop = 0;
  enter(to, ENTER_DELAY);
  const motion = animate(panel, true);
  await motion.finished;
  setPage(to);
  panel.classList.remove('is-moving');
  html.classList.remove('layer-anim');
  motion.cancel();
  setLoop(false);
  lenis.resize();
  lenis.scrollTo(0, { immediate: true, force: true });
  lenis.start();
  scrollToHash();
}

/** The current layer slides down and off; the page below comes back at its old scroll position. */
async function uncover(from: LayerId, to: LayerId | null) {
  const lenis = getLenis()!;
  const panel = panelOf(from);
  const html = document.documentElement;
  const y = window.scrollY;
  lenis.stop();
  html.classList.add('layer-anim');
  // The leaving layer becomes a fixed panel at the same content position; the page below returns under it.
  panel.classList.add('is-moving');
  panel.scrollTop = y;
  setPage(to);
  setLoop(to === null);
  lenis.resize();
  lenis.scrollTo(saved.get(to) ?? 0, { immediate: true, force: true });
  const motion = animate(panel, false);
  await motion.finished;
  panel.classList.remove('is-moving');
  html.classList.remove('layer-anim');
  motion.cancel();
  lenis.start();
}
