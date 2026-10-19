import { Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';

// The Figma file embeds its fonts without names; these are the closest free ones (measured, see docs/SITE_FLOW.md).
const sans = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-sans' });
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' });

export const fontVariables = `${sans.variable} ${mono.variable}`;
