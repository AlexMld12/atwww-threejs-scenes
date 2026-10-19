// The logo's three parts, from the SVG embedded in the .blend ("SOURCE • corrected logo.svg").
export const LOGO_VIEWBOX = { width: 224.315, height: 240.42 };

export const LOGO_PARTS = [
  'M88 76.21 L44 32.21 L0 76.21 L44 120.21 L0 164.21 L44 208.21 L88 164.21Z',
  'M164.21 120.21 L224.315 104.105 L208.21 44 L148.105 60.105 L132 0 L71.895 16.105 L88 76.21Z',
  'M88 164.21 L71.895 224.315 L132 240.42 L148.105 180.315 L208.21 196.42 L224.315 136.315 L164.21 120.21Z',
];

/** Each part as a closed list of [x, y] points in viewBox units. */
export function logoPolygons() {
  return LOGO_PARTS.map((d) =>
    [...d.matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const),
  );
}
