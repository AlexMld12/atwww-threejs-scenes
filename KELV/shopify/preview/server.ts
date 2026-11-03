import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Tag, type Context, type Emitter, type Liquid, type TagToken, type TopLevelToken } from 'liquidjs';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { createEngine, readSchema, sectionObject, type SectionData } from './liquid.ts';
import { addToStoreCart, cart, changeStoreCart, resolveRoute, storeGlobals } from './store.ts';

/**
 * `npm run dev`: serves the theme as Shopify would render it, from the theme's own Liquid files and fixture data,
 * with Vite serving the code (hot reload). Only what the theme uses is emulated; the real check is a dev store.
 */

const THEME = fileURLToPath(new URL('../theme', import.meta.url));

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

// The code comes from Vite, or in `--mode built` from the build in theme/assets (kelv.js, its chunks, kelv.css).
const SOURCES: Record<string, string> = { 'kelv.js': '/src/main.ts', 'kelv.css': '/src/styles/index.css' };

interface JsonTemplate {
  layout?: string | false;
  sections: Record<string, SectionData>;
  order: string[];
}

interface SectionGroup extends JsonTemplate {
  type: string;
  name: string;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'));

function createRenderer(built: boolean) {
  // `?v=` as on Shopify: a chunk that imports a file by its plain URL gets a second copy of it.
  const assetUrl = (name: string) => (built ? undefined : SOURCES[name]) ?? `/assets/${name}?v=1`;
  const engine = createEngine(THEME, assetUrl);

  async function renderSection(id: string, data: SectionData, globals: object, groupClass = '') {
    if (data.disabled) return '';
    const file = join(THEME, 'sections', `${data.type}.liquid`);
    const schema = readSchema(file);
    const section = sectionObject(id, data, schema);
    const html = await engine.parseAndRender(readFileSync(file, 'utf8'), { section }, { globals });
    const tag = schema.tag ?? 'div';
    const classes = ['shopify-section', groupClass, schema.class].filter(Boolean).join(' ');
    return `<${tag} id="shopify-section-${id}" class="${classes}">${html}</${tag}>`;
  }

  async function renderGroup(name: string, globals: object) {
    const group = readJson<SectionGroup>(join(THEME, 'sections', `${name}.json`));
    let html = `<!-- BEGIN sections: ${name} -->`;
    for (const key of group.order) {
      html += await renderSection(
        `sections--kelv__${key}`,
        group.sections[key],
        globals,
        `shopify-section-group-${name}`,
      );
    }
    return `${html}<!-- END sections: ${name} -->`;
  }

  registerSectionTags(engine, renderSection, renderGroup);

  /** A JSON template inside its layout; `template: null` is a page Shopify renders itself (the policies). */
  async function renderPage(name: string | null, globals: Record<string, unknown>, ownContent = '') {
    const template: JsonTemplate = name
      ? readJson(join(THEME, 'templates', `${name}.json`))
      : { sections: {}, order: [] };
    let content = ownContent;
    for (const key of template.order) {
      content += await renderSection(`template--kelv__${key}`, template.sections[key], globals);
    }
    if (template.layout === false) return content;
    const layout = join(THEME, 'layout', `${template.layout ?? 'theme'}.liquid`);
    const scope = { ...globals, content_for_layout: content };
    return engine.parseAndRender(readFileSync(layout, 'utf8'), {}, { globals: scope });
  }

  /** Section Rendering API: a section on its own, with Shopify's wrapper, as the page at `url` would render it. */
  async function renderSections(names: string[], url: string) {
    const globals = storeGlobals(THEME, resolveRoute(url), url);
    const out: Record<string, string> = {};
    for (const name of names) out[name] = await renderSection(name, { type: name }, globals);
    return out;
  }

  return { renderPage, renderSections };
}

async function readBody(req: Connect.IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (req.headers['content-type']?.includes('application/json')) return JSON.parse(text || '{}');
  return Object.fromEntries(new URLSearchParams(text));
}

const sendJson = (res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

function registerSectionTags(
  engine: Liquid,
  renderSection: (id: string, data: SectionData, globals: object) => Promise<string>,
  renderGroup: (name: string, globals: object) => Promise<string>,
) {
  const nameOf = (token: TagToken) => token.args.trim().replace(/^['"]|['"]$/g, '');

  engine.registerTag(
    'section',
    class extends Tag {
      private readonly type: string;
      constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
        super(token, remain, liquid);
        this.type = nameOf(token);
      }
      *render(ctx: Context, emitter: Emitter): Generator<unknown, void, string> {
        emitter.write(yield renderSection(this.type, { type: this.type }, ctx.globals));
      }
    },
  );

  engine.registerTag(
    'sections',
    class extends Tag {
      private readonly group: string;
      constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
        super(token, remain, liquid);
        this.group = nameOf(token);
      }
      *render(ctx: Context, emitter: Emitter): Generator<unknown, void, string> {
        emitter.write(yield renderGroup(this.group, ctx.globals));
      }
    },
  );
}

function serveAsset(url: string, res: Parameters<Connect.NextHandleFunction>[1]) {
  const name = decodeURIComponent(url.slice('/assets/'.length).split('?')[0]);
  const file = join(THEME, 'assets', name);
  if (name.includes('/') || !existsSync(file)) return false;
  res.setHeader('Content-Type', TYPES[extname(name)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
  return true;
}

export function shopifyPreview(): Plugin {
  return {
    name: 'kelv:shopify-preview',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const renderer = createRenderer(server.config.mode === 'built');
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '/';
        if (url.startsWith('/assets/')) {
          if (!serveAsset(url, res)) next();
          return;
        }
        const path = url.split('?')[0];
        if (path === '/cart.js') return sendJson(res, 200, cart());
        // The Ajax cart, and the plain forms behind it (no script: Shopify answers with the cart page).
        if (req.method === 'POST' && /^\/cart\/(add|change)(\.js)?$/.test(path)) {
          const body = await readBody(req);
          try {
            if (path.startsWith('/cart/add')) addToStoreCart(body);
            else changeStoreCart(body);
          } catch (error) {
            return sendJson(res, 422, { status: 422, description: String(error) });
          }
          if (!path.endsWith('.js')) {
            // Buy it now: Shopify follows `return_to` (the checkout).
            const location = body.return_to === '/checkout' ? '/checkout' : '/cart';
            res.writeHead(302, { Location: location }).end();
            return;
          }
          const names = String(body.sections ?? '')
            .split(',')
            .filter(Boolean);
          const sections = names.length ? await renderer.renderSections(names, String(body.sections_url ?? '/')) : {};
          return sendJson(res, 200, { ...cart(), sections });
        }
        if ((req.method === 'POST' && path === '/cart') || path === '/checkout') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><title>Checkout</title><p>Shopify checkout (not in the preview).</p>');
          return;
        }
        if (req.method === 'GET' && /[?&]sections=/.test(url)) {
          const query = new URL(url, 'http://preview').searchParams;
          return sendJson(res, 200, await renderer.renderSections(query.get('sections')!.split(','), path));
        }
        // The customer forms: nothing is stored. As on Shopify, a post without `form_key` is refused, and the page
        // comes back with `customer_posted`; an address with `+challenge` gets the captcha page first.
        if (req.method === 'POST' && url.startsWith('/contact')) {
          const body = await readBody(req);
          if (!body.form_key) {
            res.statusCode = 400;
            res.end('invalid parameters');
            return;
          }
          const back = String(
            body.return_path ?? new URL(String(req.headers.referer ?? '/'), 'http://preview').pathname,
          );
          const challenge = String(body['contact[email]'] ?? '').includes('+challenge');
          const query = new URLSearchParams({ form_key: String(body.form_key), return_path: back });
          const location = challenge ? `/challenge?${query}` : `${back}?customer_posted=true`;
          res.writeHead(302, { Location: location }).end();
          return;
        }
        // A customer form posted in the background follows Shopify's redirect to a page, without asking for HTML.
        const page = req.headers.accept?.includes('text/html') || /[?&]customer_posted=|^\/challenge/.test(url);
        if (req.method !== 'GET' || !page) return next();
        try {
          const route = resolveRoute(url);
          const globals = storeGlobals(THEME, route, url);
          const html = await renderer.renderPage(route.template, globals, route.content);
          res.statusCode = route.status;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await server.transformIndexHtml(url, html));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
