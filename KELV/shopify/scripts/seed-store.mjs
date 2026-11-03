// Puts the shop's data in a Shopify store, from the preview's fixtures (the data the theme was built on):
// the kelv.* metafield definitions, the three products (price, packshot, metafields) and their publication,
// the skin analysis page and the four policies (docs/policies).
//
//   SHOPIFY_STORE=kelv-dev.myshopify.com npm run seed
//   npm run seed -- --dry-run      prints what would be sent, without a store
//   npm run seed -- --policies     only the policies (the products' images are not uploaded again)
//
// Without SHOPIFY_ADMIN_TOKEN the calls go through the Shopify CLI, after a one-time
//   shopify store auth -s <store> --scopes write_products,write_files,write_publications,write_online_store_pages,write_legal_policies
// Running it again updates the same products, page and policies.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API_VERSION = '2026-10';
const ROOT = new URL('..', import.meta.url);
const DRY_RUN = process.argv.includes('--dry-run');
const POLICIES_ONLY = process.argv.includes('--policies');

/** The metafields the theme reads (docs/SHOPIFY.md), in the admin's order. */
const DEFINITIONS = [
  [
    'display_title',
    'Display title',
    'single_line_text_field',
    'The name in the titles (Figma sets FOAM  CLEANSER with two spaces).',
  ],
  ['code', 'Code', 'single_line_text_field', 'The cart line under the name, e.g. K1/COOL.'],
  ['step', 'Step', 'number_integer', 'Step of the routine (1–3): "Step N/3", the kit of the skin reading.'],
  ['summary', 'Summary', 'multi_line_text_field', 'The line on the product cards.'],
  ['active', 'Active', 'single_line_text_field', 'Cards: Active.'],
  ['when', 'When', 'single_line_text_field', 'Cards: When.'],
  ['size', 'Size', 'single_line_text_field', 'Cards: Size.'],
  ['details', 'Details', 'multi_line_text_field', 'Product page: Details.'],
  [
    'specs',
    'Specs',
    'json',
    'Product page table: [{"label": "…", "value": "…"}]. For Size, the part before the comma is bold.',
  ],
  ['how_to', 'How to use', 'list.single_line_text_field', 'Product page: How to use, one step per entry.'],
  ['inci', 'Ingredients (INCI)', 'multi_line_text_field', 'Product page: Ingredients.'],
  ['pairs', 'Pairs with', 'single_line_text_field', 'Product page: Pairs with.'],
  ['faq', 'FAQ', 'json', 'More Informations: [{"question": "…", "answer": "…"}]. Empty: the section is hidden.'],
  ['notes', 'Notes', 'json', 'More Informations, right column: ["…", "…"].'],
  [
    'model',
    '3D model',
    'single_line_text_field',
    'The GLB in the theme: K1_COOL_Foam, K2_CALM_Serum or K3_SEAL_Cream. Empty: the image only.',
  ],
  [
    'image_centre',
    'Image centre',
    'number_decimal',
    'Vertical centre of the bottle in the packshot (0–1), to centre it in the cards.',
  ],
];

const { products } = JSON.parse(readFileSync(new URL('preview/fixtures/products.json', ROOT), 'utf8'));
const TYPES = Object.fromEntries(DEFINITIONS.map(([key, , type]) => [key, type]));

/** A metafield value as the Admin API takes it: always a string, JSON for json and list types. */
function metafieldValue(type, value) {
  if (type === 'json' || type.startsWith('list.')) return JSON.stringify(value);
  return String(value);
}

function productInput(product, files) {
  const variant = product.variants[0];
  return {
    handle: product.handle,
    title: product.title,
    descriptionHtml: product.description,
    vendor: 'KELV',
    tags: product.tags,
    status: 'ACTIVE',
    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants: [
      {
        optionValues: [{ optionName: 'Title', name: 'Default Title' }],
        price: (variant.price / 100).toFixed(2),
        // Always available, as in the preview: stock is not counted until the client sets it up.
        inventoryItem: { tracked: false },
        inventoryPolicy: 'CONTINUE',
      },
    ],
    metafields: Object.entries(product.metafields.kelv).map(([key, { value }]) => ({
      namespace: 'kelv',
      key,
      type: TYPES[key],
      value: metafieldValue(TYPES[key], value),
    })),
    files,
  };
}

async function admin(query, variables = {}) {
  if (!process.env.SHOPIFY_ADMIN_TOKEN) return adminThroughCli(query, variables);
  const response = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body, null, 2));
  return body.data;
}

/** `shopify store execute`, with the access stored by `shopify store auth`. */
function adminThroughCli(query, variables) {
  const dir = mkdtempSync(join(tmpdir(), 'kelv-seed-'));
  try {
    writeFileSync(join(dir, 'query.graphql'), query);
    writeFileSync(join(dir, 'variables.json'), JSON.stringify(variables));
    const args = ['store', 'execute', '-s', process.env.SHOPIFY_STORE, '--version', API_VERSION, '--no-input'];
    args.push('--query-file', join(dir, 'query.graphql'), '--variable-file', join(dir, 'variables.json'));
    args.push('--output-file', join(dir, 'result.json'));
    if (/^\s*mutation\b/.test(query)) args.push('--allow-mutations');
    // shopify is a .cmd on Windows, which only runs through a shell.
    execFileSync('shopify', args, { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
    const body = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    return body.data ?? body;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function check(result, label) {
  const errors = result.userErrors ?? [];
  if (errors.length) throw new Error(`${label}: ${JSON.stringify(errors)}`);
}

async function createDefinitions() {
  for (const [key, name, type, description] of DEFINITIONS) {
    const definition = { namespace: 'kelv', key, name, type, description, ownerType: 'PRODUCT', pin: true };
    if (DRY_RUN) {
      console.log('definition', definition);
      continue;
    }
    const { metafieldDefinitionCreate: result } = await admin(
      `mutation ($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { message code } }
      }`,
      { definition },
    );
    if (result.userErrors.some((error) => error.code === 'TAKEN')) console.log(`kelv.${key}: already there`);
    else check(result, `kelv.${key}`);
  }
}

/** The packshot from theme/assets, uploaded to Shopify's staging storage; the product takes it from there. */
async function uploadImage(image) {
  const file = readFileSync(new URL(`theme/assets/${image.src}`, ROOT));
  if (DRY_RUN)
    return { originalSource: `<upload of ${image.src}, ${file.length} bytes>`, contentType: 'IMAGE', alt: image.alt };
  const { stagedUploadsCreate: result } = await admin(
    `mutation ($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } }
    }`,
    {
      input: [
        {
          resource: 'IMAGE',
          filename: image.src,
          mimeType: 'image/webp',
          httpMethod: 'POST',
          fileSize: String(file.length),
        },
      ],
    },
  );
  check(result, image.src);
  const [target] = result.stagedTargets;
  const form = new FormData();
  for (const { name, value } of target.parameters) form.append(name, value);
  form.append('file', new Blob([file], { type: 'image/webp' }), image.src);
  const upload = await fetch(target.url, { method: 'POST', body: form });
  if (!upload.ok) throw new Error(`${image.src}: upload ${upload.status}`);
  return { originalSource: target.resourceUrl, contentType: 'IMAGE', alt: image.alt };
}

async function onlineStore() {
  // By its app: the name follows the admin's language ("Magazin online").
  const { publications } = await admin(`{ publications(first: 20) { nodes { id app { handle } } } }`);
  return publications.nodes.find((publication) => publication.app?.handle === 'online_store')?.id;
}

async function setProduct(product, publication) {
  const files = [];
  for (const image of product.images) files.push(await uploadImage(image));
  const input = productInput(product, files);
  if (DRY_RUN) {
    console.log('product', JSON.stringify(input, null, 2));
    return;
  }
  const { products: existing } = await admin(`query ($q: String!) { products(first: 1, query: $q) { nodes { id } } }`, {
    q: `handle:${product.handle}`,
  });
  const id = existing.nodes[0]?.id;
  // productSet sets the whole product: run again, it replaces the fields and images instead of adding to them.
  const { productSet: result } = await admin(
    `mutation ($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) { product { id handle } userErrors { field message } }
    }`,
    { input: id ? { ...input, id } : input },
  );
  check(result, product.handle);
  if (publication) {
    const { publishablePublish: published } = await admin(
      `mutation ($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { message } }
      }`,
      { id: result.product.id, input: [{ publicationId: publication }] },
    );
    check(published, `${product.handle} (publish)`);
  }
  console.log(`${product.handle}: ${id ? 'updated' : 'created'} (${result.product.id})`);
  return result.product.id;
}

/**
 * A real `all` collection replaces Shopify's automatic one (sorted by name): the shop, the footer and the skin
 * analysis then list the products in the routine's order, and the client can reorder them in the admin.
 */
async function setAllCollection(ids, publication) {
  const collection = { title: 'Products', handle: 'all', sortOrder: 'MANUAL' };
  if (DRY_RUN) {
    console.log('collection', collection);
    return;
  }
  const { collectionByHandle: existing } = await admin(`{ collectionByHandle(handle: "all") { id } }`);
  let id = existing?.id;
  if (!id) {
    const { collectionCreate: result } = await admin(
      `mutation ($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { message } } }`,
      { input: { ...collection, products: ids } },
    );
    check(result, 'all collection');
    id = result.collection.id;
  } else {
    const { collectionAddProducts: added } = await admin(
      `mutation ($id: ID!, $ids: [ID!]!) { collectionAddProducts(id: $id, productIds: $ids) { userErrors { message } } }`,
      { id, ids },
    );
    // Already in the collection is fine: the order is set below.
    if (added.userErrors.some((error) => !/already/i.test(error.message))) check(added, 'all collection');
  }
  const moves = ids.map((productId, index) => ({ id: productId, newPosition: String(index) }));
  const { collectionReorderProducts: reordered } = await admin(
    `mutation ($id: ID!, $moves: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $moves) { userErrors { message } } }`,
    { id, moves },
  );
  check(reordered, 'all collection order');
  if (publication) {
    const { publishablePublish: published } = await admin(
      `mutation ($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`,
      { id, input: [{ publicationId: publication }] },
    );
    check(published, 'all collection (publish)');
  }
  console.log(`all collection: ${existing?.id ? 'updated' : 'created'}`);
}

/** The skin analysis lives on a page with the `page.skin-analysis` template; its content is all in the theme. */
async function setSkinAnalysisPage() {
  const page = { title: 'Skin Analysis', handle: 'skin-analysis', templateSuffix: 'skin-analysis', isPublished: true };
  if (DRY_RUN) {
    console.log('page', page);
    return;
  }
  const { pages } = await admin(`{ pages(first: 1, query: "handle:skin-analysis") { nodes { id } } }`);
  const id = pages.nodes[0]?.id;
  const { [id ? 'pageUpdate' : 'pageCreate']: result } = id
    ? await admin(
        `mutation ($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id } userErrors { message } } }`,
        { id, page },
      )
    : await admin(
        `mutation ($page: PageCreateInput!) { pageCreate(page: $page) { page { id } userErrors { message } } }`,
        { page },
      );
  check(result, 'skin-analysis page');
  console.log(`skin-analysis page: ${id ? 'updated' : 'created'}`);
}

const POLICIES = {
  PRIVACY_POLICY: 'privacy-policy',
  TERMS_OF_SERVICE: 'terms-of-service',
  REFUND_POLICY: 'refund-policy',
  SHIPPING_POLICY: 'shipping-policy',
};

async function setPolicies() {
  for (const [type, file] of Object.entries(POLICIES)) {
    const body = readFileSync(new URL(`../docs/policies/${file}.html`, ROOT), 'utf8').trim();
    if (DRY_RUN) {
      console.log('policy', type, `${body.length} characters`);
      continue;
    }
    const { shopPolicyUpdate: result } = await admin(
      `mutation ($policy: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $policy) { shopPolicy { id } userErrors { message } } }`,
      { policy: { type, body } },
    );
    // A policy Shopify manages itself (the privacy policy, by default) is refused until that is turned off.
    if (result.userErrors.length) console.warn(`${file}: not set, ${result.userErrors[0].message}`);
    else console.log(`${file}: set`);
  }
}

if (!DRY_RUN && !process.env.SHOPIFY_STORE) {
  console.error('Set SHOPIFY_STORE (kelv-dev.myshopify.com), or run with --dry-run.');
  process.exit(1);
}
if (!POLICIES_ONLY) {
  await createDefinitions();
  const publication = DRY_RUN ? null : await onlineStore();
  if (!DRY_RUN && !publication) console.warn('No Online Store publication: publish the products by hand.');
  const ids = [];
  for (const product of products) ids.push(await setProduct(product, publication));
  await setAllCollection(ids, publication);
  await setSkinAnalysisPage();
}
await setPolicies();
