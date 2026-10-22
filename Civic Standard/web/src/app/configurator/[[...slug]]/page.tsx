import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import catalogue from '@/components/product/catalogue.json';

export const dynamicParams = false;
export const metadata: Metadata = { title: 'Configurator' };

export function generateStaticParams() {
  return [{ slug: [] }, ...catalogue.map(({ slug }) => ({ slug: [slug] }))];
}

// Drawn by <Site /> in the root layout, over the home (components/Site.tsx).
export default async function ConfiguratorPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  if (slug.length > 1 || (slug[0] && !catalogue.some((p) => p.slug === slug[0]))) notFound();
  return null;
}
