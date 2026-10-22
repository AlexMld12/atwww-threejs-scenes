import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import catalogue from '@/components/product/catalogue.json';

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogue.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = catalogue.find((p) => p.slug === slug);
  return { title: product ? product.name : 'Civic Standard' };
}

// Drawn by <Site /> in the root layout, over the home (components/Site.tsx).
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!catalogue.some((p) => p.slug === slug)) notFound();
  return null;
}
