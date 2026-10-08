import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Site } from '@/components/Site';
import { fontVariables } from '@/styles/fonts';
import '@/styles/index.css';

export const metadata: Metadata = {
  title: 'KELV | Foam Cleanser',
};

export const viewport: Viewport = {
  themeColor: '#030f38',
};

// Runs before first paint; the timeout shows the page even if the app never boots.
const boot = `
history.scrollRestoration = 'manual';
var root = document.documentElement;
root.classList.add('js');
if (location.pathname.replace(/[/]$/, '') === '/skin-analysis') root.classList.add('sa-on');
setTimeout(function () { root.classList.add('is-ready'); }, 3000);
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>
        <Site />
        {children}
      </body>
    </html>
  );
}
