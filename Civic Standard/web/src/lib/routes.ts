import type { Dither } from '@/components/transition/dither';
import catalogue from '@/components/product/catalogue.json';
import projects from '@/components/projects/projects.json';
import { jumpTo, scrollPosition, setScrollLocked } from './scroll';

// The pages live in one document, as on KELV: the home stays mounted (its 3D scene, its scroll) and is only hidden
// while another page is shown, so going back is instant and nothing loads twice. The URL follows (history), and every
// change of page goes under the dither cover: cover, swap, put the scroll where it belongs, uncover.
// A product's page is one view for all products: its slug says which; so is the configurator, opened on a product.
// /projects and an open project are one page: between them there is no cover, the picture grows instead
// (`navigateSoft`). Any other address is the 404's view.
export type View = 'home' | 'products' | 'product' | 'configurator' | 'projects' | 'project' | 'notfound';

const PRODUCT_PATH = /^\/products\/([a-z0-9-]+)$/;
const CONFIGURATOR_PATH = /^\/configurator(?:\/([a-z0-9-]+))?$/;
const PROJECT_PATH = /^\/projects\/([a-z0-9-]+)$/;
const isProjects = (target: View) => target === 'projects' || target === 'project';

const pathFor = (target: View, slug: string | null) =>
  target === 'product'
    ? `/products/${slug}`
    : target === 'configurator'
      ? `/configurator${slug ? `/${slug}` : ''}`
      : target === 'products'
        ? '/products'
        : target === 'projects'
          ? '/projects'
          : target === 'project'
            ? `/projects/${slug}`
            : '/';

function titleFor(target: View, slug: string | null) {
  if (target === 'products') return 'Products';
  if (target === 'configurator') return 'Configurator';
  if (target === 'notfound') return 'Page not found';
  if (target === 'projects') return 'Our Projects';
  if (target === 'project') return projects.find((p) => p.slug === slug)?.name ?? 'Our Projects';
  const product = target === 'product' && catalogue.find((p) => p.slug === slug);
  return product ? product.name : 'Civic Standard';
}

const isProduct = (slug: string | undefined) => !slug || catalogue.some((p) => p.slug === slug);

export function viewFor(pathname: string): View {
  const path = pathname.replace(/\/$/, '');
  const product = PRODUCT_PATH.exec(path);
  if (product) return isProduct(product[1]) ? 'product' : 'notfound';
  const configurator = CONFIGURATOR_PATH.exec(path);
  if (configurator) return isProduct(configurator[1]) ? 'configurator' : 'notfound';
  const project = PROJECT_PATH.exec(path);
  if (project) return projects.some((p) => p.slug === project[1]) ? 'project' : 'notfound';
  if (path === '/products') return 'products';
  if (path === '/projects') return 'projects';
  return path === '' ? 'home' : 'notfound';
}

export function slugFor(pathname: string) {
  const path = pathname.replace(/\/$/, '');
  return PRODUCT_PATH.exec(path)?.[1] ?? CONFIGURATOR_PATH.exec(path)?.[1] ?? PROJECT_PATH.exec(path)?.[1] ?? null;
}

type Listener = () => void;
let view: View = 'home';
let slug: string | null = null;
let wantedSlug: string | null = null;
// The home (its preloader and 3D scene) is built at its first visit only: another page entered first has none.
let homeVisited = true;
let entered = 0;
let busy = false;
let wanted: View | null = null;
let dither: Dither | null = null;
const listeners = new Set<Listener>();
const enterListeners = new Set<(view: View) => void>();
// Where each page was left, so coming back finds it as it was.
const saved: Partial<Record<View, number>> = {};

export const currentView = () => view;
export const currentSlug = () => slug;
export const isHomeVisited = () => homeVisited;
/** Bumped at each arrival on a page: a key that replays its entrance. */
export const entryCount = () => entered;

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The page's entrance animations start from here (the uncover, or the preloader's handover on a first visit). */
export function onEnter(listener: (view: View) => void) {
  enterListeners.add(listener);
  return () => {
    enterListeners.delete(listener);
  };
}

export function announceEnter() {
  enterListeners.forEach((listener) => listener(view));
}

/** The page the document was loaded on, before the first render. */
export function startView(initial: View, initialSlug: string | null = null) {
  view = initial;
  slug = initialSlug;
  homeVisited = initial === 'home';
}

export function registerDither(next: Dither | null) {
  dither = next;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function run() {
  if (busy) return;
  busy = true;
  while (wanted && (wanted !== view || wantedSlug !== slug)) {
    const target = wanted;
    const targetSlug = wantedSlug;
    await dither?.cover();
    saved[view] = scrollPosition();
    view = target;
    slug = targetSlug;
    entered++;
    // the home's first visit: its preloader holds the page until the scene hands over, as on a first load
    if (target === 'home' && !homeVisited) {
      homeVisited = true;
      setScrollLocked(true);
    }
    document.title = titleFor(target, targetSlug);
    listeners.forEach((listener) => listener());
    await nextFrame();
    // a product's page, the configurator and the 404 open at their top, the others where they were left
    jumpTo(['product', 'configurator', 'notfound', 'projects', 'project'].includes(target) ? 0 : (saved[target] ?? 0));
    await nextFrame();
    if (wanted !== target || wantedSlug !== targetSlug) continue;
    const clear = dither?.uncover();
    announceEnter();
    await clear;
  }
  wanted = null;
  busy = false;
}

/** Goes to another page of the site (a link's click), with the transition. */
export function navigate(target: View, targetSlug: string | null = null) {
  const path = pathFor(target, targetSlug);
  if (path !== window.location.pathname) window.history.pushState({ view: target }, '', path);
  wanted = target;
  wantedSlug = targetSlug;
  void run();
}

/** Between /projects and a project: the address and the view change, the page stays (its picture moves instead). */
export function navigateSoft(target: 'projects' | 'project', targetSlug: string | null = null, replace = false) {
  const path = pathFor(target, targetSlug);
  if (path !== window.location.pathname)
    window.history[replace ? 'replaceState' : 'pushState']({ view: target }, '', path);
  swap(target, targetSlug);
}

function swap(target: View, targetSlug: string | null) {
  view = target;
  slug = targetSlug;
  document.title = titleFor(target, targetSlug);
  listeners.forEach((listener) => listener());
}

/** Back and Forward: the same transition to the page the history has (none inside /projects). */
export function followHistory() {
  const target = viewFor(window.location.pathname);
  const targetSlug = slugFor(window.location.pathname);
  if (!busy && isProjects(view) && isProjects(target)) return swap(target, targetSlug);
  wanted = target;
  wantedSlug = targetSlug;
  void run();
}
