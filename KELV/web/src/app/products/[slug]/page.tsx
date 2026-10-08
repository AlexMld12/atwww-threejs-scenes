import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PRODUCTS, productBySlug } from '@/shop/catalog';

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const product = productBySlug((await params).slug);
  return { title: `KELV | ${product?.name ?? 'Shop'}` };
}

// The product page is rendered by <Site /> in the root layout.
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!productBySlug((await params).slug)) notFound();
  return null;
}
