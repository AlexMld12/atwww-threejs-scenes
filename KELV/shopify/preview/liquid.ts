import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Hash,
  Liquid,
  Tag,
  type Context,
  type Emitter,
  type TagToken,
  type Template,
  type TopLevelToken,
} from 'liquidjs';

/**
 * A Liquid engine with the part of Shopify's dialect the theme uses, so the preview renders the theme's own files.
 * Shopify-only objects come from the store fixture (preview/store.ts).
 */

export interface SectionData {
  type: string;
  settings?: Record<string, unknown>;
  blocks?: Record<string, { type: string; settings?: Record<string, unknown> }>;
  block_order?: string[];
  disabled?: boolean;
}

interface SchemaSetting {
  id?: string;
  type: string;
  default?: unknown;
}

interface Schema {
  tag?: string;
  class?: string;
  settings?: SchemaSetting[];
  blocks?: { type: string; settings?: SchemaSetting[] }[];
}

export interface AssetResolver {
  (name: string): string;
}

export function createEngine(themeDir: string, assetUrl: AssetResolver) {
  const engine = new Liquid({
    root: [join(themeDir, 'snippets'), join(themeDir, 'sections'), join(themeDir, 'layout')],
    extname: '.liquid',
    strictFilters: true,
    jsTruthy: false,
    dynamicPartials: true,
  });
  const locale = JSON.parse(readFileSync(join(themeDir, 'locales/en.default.json'), 'utf8'));

  // Blocks Shopify reads itself; the page never shows them.
  for (const name of ['schema', 'stylesheet', 'javascript', 'doc']) engine.registerTag(name, silentBlock(name));
  engine.registerTag('form', FormTag);

  engine.registerFilter('asset_url', (name: string) => assetUrl(name));
  engine.registerFilter('inline_asset_content', (name: string) => readFileSync(join(themeDir, 'assets', name), 'utf8'));
  engine.registerFilter(
    'stylesheet_tag',
    (url: string) => `<link href="${url}" rel="stylesheet" type="text/css" media="all" />`,
  );
  engine.registerFilter(
    'preload_tag',
    (url: string, ...args: unknown[]) => `<link href="${url}" rel="preload" ${attributes(args)}>`,
  );
  engine.registerFilter('money', (cents: number) => `$${(Number(cents) / 100).toFixed(2)}`);
  engine.registerFilter('money_without_currency', (cents: number) => (Number(cents) / 100).toFixed(2));
  engine.registerFilter('handleize', handleize);
  engine.registerFilter('handle', handleize);
  engine.registerFilter('image_url', (image: unknown, ...args: unknown[]) => imageUrl(image, args, assetUrl));
  engine.registerFilter('image_tag', (url: string, ...args: unknown[]) => imageTag(url, args));
  engine.registerFilter('t', (key: string, ...args: unknown[]) => translate(locale, key, args));

  return engine;
}

function silentBlock(name: string) {
  return class extends Tag {
    constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
      super(token, remain, liquid);
      while (remain.length) {
        const next = remain.shift()!;
        if (next.kind === 4 /* TokenKind.Tag */ && (next as TagToken).name === `end${name}`) return;
      }
      throw new Error(`{% ${name} %} without {% end${name} %}`);
    }
    *render() {}
  };
}

const FORM_ACTIONS: Record<string, string> = {
  customer: '/contact',
  contact: '/contact',
  product: '/cart/add',
};

/** `{% form 'customer', id: 'x', class: 'y' %}`: Shopify's <form> with its hidden fields, and a `form` object. */
class FormTag extends Tag {
  private readonly type: string;
  private readonly hash: Hash;
  private readonly templates: Template[] = [];

  constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
    super(token, remain, liquid);
    // The object after the type (`{% form 'product', product %}`) only matters to Shopify.
    const match = token.args.match(/^\s*['"]([\w-]+)['"]\s*(?:,\s*[\w.]+\s*(?=,|$))?,?(.*)$/s);
    if (!match) throw new Error(`{% form ${token.args} %}: the form type comes first`);
    this.type = match[1];
    this.hash = new Hash(match[2]);
    const stream = liquid.parser
      .parseStream(remain)
      .on('tag:endform', () => stream.stop())
      .on('template', (template: Template) => this.templates.push(template))
      .on('end', () => {
        throw new Error('{% form %} without {% endform %}');
      });
    stream.start();
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const attrs = (yield this.hash.render(ctx)) as Record<string, unknown>;
    const action = FORM_ACTIONS[this.type] ?? '/contact';
    const anchor = attrs.id ? `#${attrs.id}` : '';
    const extra = Object.entries(attrs)
      .map(([key, value]) => `${key}="${String(value)}"`)
      .join(' ');
    emitter.write(`<form method="post" action="${action}${anchor}" accept-charset="UTF-8" ${extra}>`);
    emitter.write(`<input type="hidden" name="form_type" value="${this.type}" />`);
    emitter.write('<input type="hidden" name="utf8" value="✓" />');
    ctx.push({ form: { posted_successfully: false, errors: null } });
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
    ctx.pop();
    emitter.write('</form>');
  }
}

export function handleize(value: string) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Named arguments arrive as [key, value] pairs. */
function named(args: unknown[]) {
  const out: Record<string, unknown> = {};
  for (const arg of args) if (Array.isArray(arg)) out[arg[0]] = arg[1];
  return out;
}

/** Named arguments as HTML attributes (`true` is a bare attribute), minus the ones the filter reads itself. */
function attributes(args: unknown[], skip: string[] = []) {
  return Object.entries(named(args))
    .filter(([key, value]) => !skip.includes(key) && value !== null && value !== undefined && value !== false)
    .map(([key, value]) => (value === true ? key : `${key}="${String(value)}"`))
    .join(' ');
}

// Shopify's image_tag knows the image behind a URL from image_url: its width and height go on the <img>.
const imageSizes = new Map<string, { width: number; height: number }>();

function imageUrl(image: unknown, args: unknown[], assetUrl: AssetResolver) {
  const object =
    typeof image === 'string' ? { src: image } : (image as { src?: string; width?: number; height?: number });
  if (!object?.src) return '';
  const { width } = named(args);
  const base = object.src.startsWith('/') ? object.src : assetUrl(object.src);
  const url = width ? `${base}${base.includes('?') ? '&' : '?'}width=${width}` : base;
  if (object.width && object.height) imageSizes.set(url, { width: object.width, height: object.height });
  return url;
}

function imageTag(url: string, args: unknown[]) {
  const size = imageSizes.get(url);
  const dimensions = size ? `width="${size.width}" height="${size.height}" ` : '';
  return `<img src="${url}" ${dimensions}${attributes(args, ['widths', 'preload'])}>`;
}

function translate(locale: Record<string, unknown>, key: string, args: unknown[]) {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale);
  if (typeof value !== 'string') return `translation missing: en.${key}`;
  const vars = named(args);
  const text = value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(vars[name] ?? ''));
  // Shopify escapes every translation except the `_html` keys.
  return key.endsWith('_html') ? text : escapeHtml(text);
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** The `{% schema %}` JSON of a section file. */
export function readSchema(file: string): Schema {
  if (!existsSync(file)) throw new Error(`No section file ${file}`);
  const match = readFileSync(file, 'utf8').match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
  return match ? JSON.parse(match[1]) : {};
}

function withDefaults(settings: SchemaSetting[] = [], values: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const setting of settings) if (setting.id) out[setting.id] = setting.default ?? null;
  return { ...out, ...values };
}

/** The `section` object Shopify gives a section file, settings completed from the schema's defaults. */
export function sectionObject(id: string, data: SectionData, schema: Schema) {
  const order = data.block_order ?? Object.keys(data.blocks ?? {});
  const blocks = order.map((blockId) => {
    const block = data.blocks![blockId];
    const blockSchema = schema.blocks?.find((b) => b.type === block.type);
    return {
      id: blockId,
      type: block.type,
      settings: withDefaults(blockSchema?.settings, block.settings),
      shopify_attributes: '',
    };
  });
  return { id, settings: withDefaults(schema.settings, data.settings), blocks, block_order: order };
}
