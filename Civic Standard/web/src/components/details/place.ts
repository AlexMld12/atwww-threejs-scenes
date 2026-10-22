import { designCss, topForBaseline } from '@/lib/design';

const FRAME_CENTRE = 720;

/** Left column from the left edge, right column from the centre, as Figma's 1440 frame lays them out. */
export const fromLeft = (x: number) => designCss(x);
export const fromCentre = (x: number) => `calc(50% + ${designCss(x - FRAME_CENTRE)})`;

/** Top of a text block from its first baseline (Figma px), for its font, size and line height. */
export const textTop = (font: 'sans' | 'inter' | 'mono', baseline: number, size: number, lineHeight: number) =>
  designCss(topForBaseline(font, baseline, size, lineHeight));
