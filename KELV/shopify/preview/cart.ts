/**
 * The preview's cart: one cart for the whole server, kept in memory, with the part of Shopify's Ajax API the theme
 * calls (`/cart.js`, `/cart/add.js`, `/cart/change.js`). The `cart` Liquid object is built from it.
 */

interface FixtureProduct {
  handle: string;
  title: string;
  url: string;
  featured_image: unknown;
  variants: { id: number; price: number }[];
}

interface Line {
  key: string;
  variantId: number;
  quantity: number;
}

let lines: Line[] = [];

export function cartObject(products: FixtureProduct[]) {
  const items = lines.flatMap((line) => {
    const product = products.find((p) => p.variants.some((v) => v.id === line.variantId));
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) return [];
    return [
      {
        key: line.key,
        id: line.variantId,
        variant_id: line.variantId,
        quantity: line.quantity,
        title: product.title,
        url: `${product.url}?variant=${line.variantId}`,
        price: variant.price,
        final_price: variant.price,
        final_line_price: variant.price * line.quantity,
        image: product.featured_image,
        product,
      },
    ];
  });
  return {
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    total_price: items.reduce((sum, item) => sum + item.final_line_price, 0),
    items,
  };
}

/** `/cart/add.js`: `{ id, quantity }` or `{ items: [...] }`; a variant already in the cart gets the quantity added. */
export function addToCart(body: Record<string, unknown>, products: FixtureProduct[]) {
  const requested = (body.items as { id: unknown; quantity?: unknown }[] | undefined) ?? [body as { id: unknown }];
  for (const item of requested) {
    const variantId = Number(item.id);
    const quantity = Math.max(1, Number((item as { quantity?: unknown }).quantity ?? 1));
    if (!products.some((p) => p.variants.some((v) => v.id === variantId))) {
      throw new Error(`No variant ${String(item.id)}`);
    }
    const line = lines.find((l) => l.variantId === variantId);
    if (line) line.quantity += quantity;
    // On top, as Shopify puts a new line.
    else lines.unshift({ key: `${variantId}:preview`, variantId, quantity });
  }
}

/** `/cart/change.js`: `{ id: <line key or variant id>, quantity }`; 0 removes the line. */
export function changeCart(body: Record<string, unknown>) {
  const id = String(body.id ?? body.line);
  const quantity = Math.max(0, Number(body.quantity));
  const line = lines.find((l) => l.key === id || String(l.variantId) === id);
  if (!line) throw new Error(`No cart line ${id}`);
  if (quantity) line.quantity = quantity;
  else lines = lines.filter((l) => l !== line);
}
