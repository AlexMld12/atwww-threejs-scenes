import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addToCart, cartObject, changeCart } from './cart.ts';

/**
 * The store the preview pretends to be: its routes and the global objects Shopify gives every template.
 * Products and policies come from fixtures/ (generated once from web/'s catalogue and legal drafts).
 */

export interface Route {
  /** The JSON template (`page.skin-analysis`), or null for a page Shopify renders itself. */
  template: string | null;
  pageType: string;
  status: number;
  title: string;
  /** Markup Shopify puts in `content_for_layout` itself (the policies). */
  content?: string;
  objects?: Record<string, unknown>;
}

interface Product {
  handle: string;
  title: string;
  url: string;
  featured_image: unknown;
  variants: { id: number; price: number }[];
}

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const { products: PRODUCTS, coming_soon: COMING_SOON } = fixture<{ products: Product[]; coming_soon: unknown[] }>(
  'products.json',
);
const POLICIES = fixture<Record<string, { title: string; body: string }>>('policies.json');

const policy = (handle: string) => ({ url: `/policies/${handle}`, ...POLICIES[handle] });

const SHOP = {
  name: 'KELV',
  currency: 'USD',
  locale: 'en',
  privacy_policy: policy('privacy-policy'),
  refund_policy: policy('refund-policy'),
  shipping_policy: policy('shipping-policy'),
  terms_of_service: policy('terms-of-service'),
};

const ROUTES = {
  root_url: '/',
  cart_url: '/cart',
  cart_add_url: '/cart/add',
  cart_change_url: '/cart/change',
  cart_update_url: '/cart/update',
  collections_url: '/collections',
  all_products_collection_url: '/collections/all',
  search_url: '/search',
};

const ALL = { handle: 'all', title: 'Products', url: '/collections/all', products: PRODUCTS, coming_soon: COMING_SOON };
const COLLECTIONS: Record<string, typeof ALL> = { all: ALL };

const PAGES: Record<string, { title: string; template_suffix: string | null }> = {
  'skin-analysis': { title: 'Skin Analysis', template_suffix: 'skin-analysis' },
};

export const cart = () => cartObject(PRODUCTS);
export const addToStoreCart = (body: Record<string, unknown>) => addToCart(body, PRODUCTS);
export const changeStoreCart = changeCart;

const notFound: Route = { template: '404', pageType: '404', status: 404, title: '404 Not Found' };

export function resolveRoute(url: string): Route {
  const path = new URL(url, 'http://preview').pathname.replace(/\/$/, '') || '/';
  if (path === '/') return { template: 'index', pageType: 'index', status: 200, title: SHOP.name };

  if (path === '/cart') return { template: 'cart', pageType: 'cart', status: 200, title: 'Cart' };

  const [, kind, handle] = path.split('/');
  if (kind === 'pages' && PAGES[handle]) {
    const page = { handle, ...PAGES[handle] };
    const template = page.template_suffix ? `page.${page.template_suffix}` : 'page';
    return { template, pageType: 'page', status: 200, title: page.title, objects: { page } };
  }
  if (kind === 'collections' && COLLECTIONS[handle]) {
    const collection = COLLECTIONS[handle];
    return {
      template: 'collection',
      pageType: 'collection',
      status: 200,
      title: collection.title,
      objects: { collection },
    };
  }
  if (kind === 'products') {
    const product = PRODUCTS.find((p) => p.handle === handle);
    if (product)
      return { template: 'product', pageType: 'product', status: 200, title: product.title, objects: { product } };
  }
  if (kind === 'policies' && POLICIES[handle]) {
    const { title, body } = POLICIES[handle];
    // Shopify's own markup for a policy page.
    const content = `<div class="shopify-policy__container"><div class="shopify-policy__title"><h1>${title}</h1></div><div class="shopify-policy__body"><div class="rte">${body}</div></div></div>`;
    return { template: null, pageType: 'policy', status: 200, title, content };
  }
  if (path === '/challenge') {
    // Shopify's own markup for the captcha it asks for after a form.
    const query = new URL(url, 'http://preview').searchParams;
    const hidden = ['form_key', 'return_path']
      .map((name) => `<input type="hidden" name="${name}" value="${query.get(name) ?? ''}">`)
      .join('');
    const content = `<div class="shopify-challenge__container"><p class="shopify-challenge__message">To continue, let us know you're not a robot.</p><form method="post" action="/contact">${hidden}<div class="h-captcha" style="width:303px;height:78px;background:#f9f9f9;border:1px solid #e0e0e0"></div><input class="shopify-challenge__button btn" type="submit" value="Submit"></form></div>`;
    return { template: null, pageType: 'captcha', status: 200, title: 'Challenge', content };
  }
  return notFound;
}

function themeSettings(themeDir: string) {
  const schema: { settings?: { id?: string; default?: unknown }[] }[] = JSON.parse(
    readFileSync(join(themeDir, 'config/settings_schema.json'), 'utf8'),
  );
  const data = JSON.parse(readFileSync(join(themeDir, 'config/settings_data.json'), 'utf8'));
  const defaults: Record<string, unknown> = {};
  for (const group of schema) for (const s of group.settings ?? []) if (s.id) defaults[s.id] = s.default ?? null;
  const current = typeof data.current === 'string' ? data.presets[data.current] : data.current;
  return { ...defaults, ...current };
}

export function storeGlobals(themeDir: string, route: Route, url: string): Record<string, unknown> {
  // `?design_mode=1`: the page as Shopify's theme editor shows it.
  const designMode = new URL(url, 'http://preview').searchParams.has('design_mode');
  const [name, suffix = null] = (route.template ?? route.pageType).split('.');
  return {
    shop: SHOP,
    settings: themeSettings(themeDir),
    routes: ROUTES,
    request: {
      page_type: route.pageType,
      path: new URL(url, 'http://preview').pathname,
      design_mode: designMode,
      locale: { iso_code: SHOP.locale },
    },
    template: { name, suffix, directory: null },
    page_title: route.title,
    content_for_header: designMode ? '<script>window.Shopify = { designMode: true };</script>' : '',
    collections: COLLECTIONS,
    all_products: Object.fromEntries(PRODUCTS.map((p) => [p.handle, p])),
    cart: cart(),
    customer: null,
    ...route.objects,
  };
}
