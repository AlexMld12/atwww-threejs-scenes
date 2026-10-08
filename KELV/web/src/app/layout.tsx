import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Site } from '@/components/Site';
import { LAYER_ROUTES } from '@/lib/page-layers';
import { fontVariables } from '@/styles/fonts';
import '@/styles/index.css';

export const metadata: Metadata = {
  title: 'KELV | Foam Cleanser',
};

export const viewport: Viewport = {
  themeColor: '#030f38',
};

// Runs before first paint (a layer URL makes that layer the page); the timeout shows the page even if the app never boots.
const boot = `
history.scrollRestoration = 'manual';
var root = document.documentElement;
root.classList.add('js');
var path = location.pathname.replace(/[/]$/, '') || '/';
${JSON.stringify(LAYER_ROUTES)}.forEach(function (route) {
  var match = route.exact.indexOf(path) >= 0 || route.prefix.some(function (p) { return path.indexOf(p) === 0; });
  if (match) root.dataset.page = route.layer;
});
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
