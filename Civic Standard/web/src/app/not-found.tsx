import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
};

// Drawn by <Site /> in the root layout, from the address (routes.ts: any other path is the 404's view).
export default function NotFound() {
  return null;
}
