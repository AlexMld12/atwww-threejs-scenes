import { Martian_Mono } from 'next/font/google';
import localFont from 'next/font/local';

// Only the Regular cut was supplied; the navbar's heavier wordmark is thickened in nav.css.
const sans = localFont({
  src: '../fonts/aeonik-pro-regular.woff2',
  weight: '400',
  variable: '--font-sans',
});
const mono = Martian_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' });

export const fontVariables = `${sans.variable} ${mono.variable}`;
