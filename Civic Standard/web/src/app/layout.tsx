import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import 'lenis/dist/lenis.css';
import { Site } from '@/components/Site';
import { fontVariables } from '@/styles/fonts';
import '@/styles/index.css';

export const metadata: Metadata = {
  title: 'Civic Standard',
  description: 'Furniture for squares, parks and streets.',
};

export const viewport: Viewport = {
  themeColor: '#f3f0ea',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <Site />
        {children}
      </body>
    </html>
  );
}
