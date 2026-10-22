'use client';

import { ProductHero } from './ProductHero';
import { ProductNext } from './ProductNext';
import { ProductShowcase } from './ProductShowcase';
import { ProductSpecs } from './ProductSpecs';
import { ProductStory } from './ProductStory';
import { productBySlug } from './content';

/** A product's page (Product CMS.pdf), section by section. */
export function Product({ slug }: { slug: string | null }) {
  const page = productBySlug(slug);
  if (!page) return null;
  return (
    <div className="product">
      <ProductHero page={page} />
      <ProductStory page={page} />
      <ProductShowcase page={page} />
      <ProductSpecs page={page} />
      <ProductNext page={page} />
    </div>
  );
}
