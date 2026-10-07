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

// Runs before first paint: refresh always starts at the top (the scroll animations start
// from 0), `js` hides reveal targets, and a direct visit to /skin-analysis shows the panel
// from the first frame. The timeout is a safety net that shows the page if JS fails.
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
