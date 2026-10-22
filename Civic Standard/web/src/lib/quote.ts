import catalogue from '@/components/product/catalogue.json';
import { navigate } from './routes';

// The quote list (Quote Open.pdf): what the visitor picked in the configurator, kept in the browser between visits.
// One store for the whole site: the navbar counts it, the drawer lists it, the configurator adds to it.
export interface QuoteItem {
  key: string;
  /** The product (catalogue id) and its finish (a palette id, or 'galvanised'). */
  id: string;
  finish: string;
  qty: number;
}

type Listener = () => void;
const STORAGE = 'civic-standard:quote';
const listeners = new Set<Listener>();
let items: QuoteItem[] = [];
let open = false;
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE) ?? '[]');
    if (Array.isArray(saved)) items = saved;
  } catch {
    // a private window or blocked storage: the list lives for this visit only
  }
}

function change(next: QuoteItem[]) {
  items = next;
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(items));
  } catch {
    // as above
  }
  listeners.forEach((listener) => listener());
}

export function subscribeQuote(listener: Listener) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const NONE: QuoteItem[] = [];
export const quoteItems = () => (loaded ? items : NONE);
export const serverQuoteItems = () => NONE;
export const isQuoteOpen = () => open;

/** Adds a configuration, or the same one once more. Returns its key. */
export function addToQuote(id: string, finish: string) {
  load();
  const same = items.find((item) => item.id === id && item.finish === finish);
  if (same) {
    change(items.map((item) => (item === same ? { ...item, qty: item.qty + 1 } : item)));
    return same.key;
  }
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  change([...items, { key, id, finish, qty: 1 }]);
  return key;
}

/** EDIT CONFIGURATION: the configurator's pick replaces the item's. */
export function updateQuote(key: string, id: string, finish: string) {
  change(items.map((item) => (item.key === key ? { ...item, id, finish } : item)));
}

export function setQuantity(key: string, qty: number) {
  change(items.map((item) => (item.key === key ? { ...item, qty: Math.max(1, qty) } : item)));
}

export function removeFromQuote(key: string) {
  change(items.filter((item) => item.key !== key));
}

export function openQuote() {
  open = true;
  listeners.forEach((listener) => listener());
}

export function closeQuote() {
  open = false;
  listeners.forEach((listener) => listener());
}

// Into the configurator on a product: from its page, the home's section, or EDIT CONFIGURATION (then its pick
// replaces the item's instead of adding one).
export interface Pick {
  id: string;
  finish?: string;
  edit?: string;
}
let pick: Pick | null = null;

export function configure(next: Pick) {
  pick = next;
  closeQuote();
  const slug = catalogue.find((p) => p.id === next.id)?.slug ?? null;
  navigate('configurator', slug);
}

/** The pick the configurator opens on (once), else the address's product. */
export function takePick(slug: string | null): Pick {
  const taken = pick ?? { id: catalogue.find((p) => p.slug === slug)?.id ?? 'K7_armrests' };
  pick = null;
  return taken;
}
