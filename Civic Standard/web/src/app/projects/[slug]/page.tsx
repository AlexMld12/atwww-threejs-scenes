import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import projects from '@/components/projects/projects.json';

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: projects.find((p) => p.slug === slug)?.name ?? 'Our Projects' };
}

// Drawn by <Site /> in the root layout: /projects with this project open (components/projects/Projects.tsx).
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!projects.some((p) => p.slug === slug)) notFound();
  return null;
}
