import type Lenis from 'lenis';

/** Pages that live in the same document as the home and slide over it (no reload, the home keeps its state). */
export type LayerId = 'sa' | 'shop';

export const LEGAL_PATHS = ['/privacy-policy', '/terms-of-use'];

// Also read by the boot script in layout.tsx, before the first paint.
export const LAYER_ROUTES: { layer: LayerId; exact: string[]; prefix: string[] }[] = [
  { layer: 'sa', exact: ['/skin-analysis'], prefix: [] },
  { layer: 'shop', exact: ['/products', ...LEGAL_PATHS], prefix: ['/products/'] },
];

export function normalizePath(pathname: string) {
  return pathname.replace(/\/$/, '') || '/';
}

export function layerFor(pathname: string): LayerId | null {
  const path = normalizePath(pathname);
  const route = LAYER_ROUTES.find((r) => r.exact.includes(path) || r.prefix.some((p) => path.startsWith(p)));
  return route?.layer ?? null;
}

/** True while a layer is the page (the home is hidden under it). */
export function isLayerPage() {
  return Boolean(document.documentElement.dataset.page);
}

interface Layer {
  panel: HTMLElement;
  /** Replays the layer's entrance animations, `delay` seconds from now. */
  enter: (delay: number) => void;
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
export const DIRECT_ENTRY_DELAY = 0.1;

const layers = new Map<LayerId, Layer>();
const saved = new Map<LayerId | null, number>();
let stack: Entry[] = [];
let wanted: Entry | null = null;
let busy = false;
let scrim: HTMLElement | null = null;
let lenis: Lenis | null = null;
let setLoop: (enabled: boolean) => void = () => {};

export function registerLayer(id: LayerId, layer: Layer) {
  layers.set(id, layer);
  return () => {
    if (layers.get(id) === layer) layers.delete(id);
  };
}

export function registerScrim(element: HTMLElement | null) {
  scrim = element;
}

/** First call: the stack starts from the URL the page was loaded with. */
export function startLayers(options: { lenis: Lenis; setLoop: (enabled: boolean) => void; path: string }) {
  lenis = options.lenis;
  setLoop = options.setLoop;
  if (stack.length) return;
  const layer = layerFor(options.path);
  stack = [{ layer: null, path: '/', moved: false }];
  if (layer) {
    stack.push({ layer, path: normalizePath(options.path), moved: false });
    setLoop(false);
  }
}

export function directEntryLayer() {
  return stack.length > 1 ? layers.get(stack[stack.length - 1].layer!) : undefined;
}

/** Brings the layer stack in line with the URL; Back may be pressed mid-transition, so it loops. */
export function followPath(pathname: string) {
  const path = normalizePath(pathname);
  wanted = { layer: layerFor(path), path, moved: false };
  void sync();
}

/** Where a click on an in-site link should go: Back when it is the page below, so history stays tidy. */
export function backTarget(pathname: string) {
  const path = normalizePath(pathname);
  const top = stack[stack.length - 1];
  const below = stack[stack.length - 2];
  return Boolean(top && below && !top.moved && below.path === path);
}

async function sync() {
  if (busy || !lenis) return;
  busy = true;
  while (wanted) {
    const target = wanted;
    const top = stack[stack.length - 1];
    if (target.layer === top.layer) {
      if (target.path !== top.path) Object.assign(top, { path: target.path, moved: true });
      if (wanted === target) wanted = null;
      continue;
    }
    const index = stack.findIndex((entry) => entry.layer === target.layer);
    if (index >= 0) {
      await uncover(top.layer!, target.layer);
      stack = stack.slice(0, index + 1);
      stack[index].path = target.path;
    } else {
      await cover(top.layer, target.layer!);
      stack.push({ ...target });
    }
  }
  busy = false;
}

function animate(panel: HTMLElement, opening: boolean) {
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
}

/** The new layer slides up over the current page (the home or another layer). */
async function cover(from: LayerId | null, to: LayerId) {
  const layer = layers.get(to);
  if (!layer || !lenis) return;
  const html = document.documentElement;
  saved.set(from, window.scrollY);
  lenis.stop();
  html.classList.add('layer-anim');
  layer.panel.classList.add('is-moving');
  layer.panel.scrollTop = 0;
  layer.enter(ENTER_DELAY);
  const motion = animate(layer.panel, true);
  await motion.finished;
  setPage(to);
  layer.panel.classList.remove('is-moving');
  html.classList.remove('layer-anim');
  motion.cancel();
  setLoop(false);
  lenis.resize();
  lenis.scrollTo(0, { immediate: true, force: true });
  lenis.start();
}

/** The current layer slides down and off; the page below comes back at its old scroll position. */
async function uncover(from: LayerId, to: LayerId | null) {
  const layer = layers.get(from);
  if (!layer || !lenis) return;
  const html = document.documentElement;
  const y = window.scrollY;
  lenis.stop();
  html.classList.add('layer-anim');
  // The leaving layer becomes a fixed panel at the same content position; the page below returns under it.
  layer.panel.classList.add('is-moving');
  layer.panel.scrollTop = y;
  setPage(to);
  setLoop(to === null);
  lenis.resize();
  lenis.scrollTo(saved.get(to) ?? 0, { immediate: true, force: true });
  const motion = animate(layer.panel, false);
  await motion.finished;
  layer.panel.classList.remove('is-moving');
  html.classList.remove('layer-anim');
  motion.cancel();
  lenis.start();
}
