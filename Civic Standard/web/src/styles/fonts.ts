import { Inter, Martian_Mono } from 'next/font/google';
import localFont from 'next/font/local';

// Only the Regular cut was supplied; the navbar's heavier wordmark is thickened in nav.css.
const sans = localFont({
  src: '../fonts/aeonik-pro-regular.woff2',
  weight: '400',
  variable: '--font-sans',
});
// Solid · Civic · Calm: Inter at its text optical size (opsz 14; matched to the PDF's glyphs, IoU 0.90–0.94).
const inter = Inter({ subsets: ['latin'], axes: ['opsz'], variable: '--font-inter' });
const mono = Martian_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' });

export const fontVariables = `${sans.variable} ${inter.variable} ${mono.variable}`;
