import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import localFont from 'next/font/local';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-archivo',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
});

const archivoExpanded = localFont({
  src: [
    { path: '../fonts/Archivo-Expanded-ExtraBold.woff2', weight: '800' },
    { path: '../fonts/Archivo-Expanded-Black.woff2', weight: '900' },
  ],
  variable: '--font-archivo-expanded',
});

const archivoCondensed = localFont({
  src: [
    { path: '../fonts/Archivo-ExtraCondensed-Bold.woff2', weight: '700' },
    { path: '../fonts/Archivo-ExtraCondensed-ExtraBold.woff2', weight: '800' },
  ],
  variable: '--font-archivo-condensed',
});

export const fontVariables = [archivo, plexMono, archivoExpanded, archivoCondensed]
  .map((font) => font.variable)
  .join(' ');
