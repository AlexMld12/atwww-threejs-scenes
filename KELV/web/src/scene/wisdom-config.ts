export const WISDOM_ASSETS = '/wisdom/';
export const WISDOM_MODEL = 'wisdom.glb';

/** The clip time the look and frame were fitted at; the amplified motion keeps this frame unchanged. */
export const MOTION_PIVOT = 5;

// Fitted to the Figma tile (video-poster.webp) at t = 5 s, patch by patch; rims and glass by eye (docs/SITE_FLOW.md, GALLERY).
export const WISDOM_LOOK = {
  exposure: 0,
  ambient: 0.625,
  roughness: 1.93,
  /** Scale of each studio light, by its control name. */
  lights: { Key: 1.1, Fill: 0.44, Top: 3.05, Rim: 2.25, GlassStrip: 2.56, PropEdge: 1.6 } as Record<string, number>,
  /** Emission of the backdrop wall and the shelf's lit edge. */
  wall: 1,
  shelf: 1.07,
  /** The wall and shelf as the reflected environment: brightness, colour, blur (PMREM sigma). */
  reflection: { strength: 1.5, tint: '#a6a8fe', blur: 0.02 },
  /** Edge glow on the black props (Fresnel): colour, brightness, sharpness. */
  propRim: { color: '#8a8cff', strength: 2, power: 12 },
  cap: { roughness: 0.045, transmission: 1, ior: 1.49, tint: '#e6e8fd' },
  /** Dark tinted glass; `saturation`: how much of the backdrop's colour it passes (REF_129: 0.1). */
  glass: {
    roughness: 0.03,
    transmission: 1,
    tint: '#1c1d3c',
    saturation: 1,
    thickness: 2.5,
    absorption: 120,
    absorbed: '#f5f9fb',
  },
  /** Where the fluted dispenser stands in Figma, relative to REF_129 (metres on the shelf). */
  dispenser: { x: 0.0107, z: 0.012 },
  /** REF_129's camera travel (sideways + yaw, towards the shelf) and the products' turn, scaled around MOTION_PIVOT. */
  motion: { lateral: 2.5, push: 2, spin: 2 },
  /** Zoom and pan of the image in NDC, on top of the animated camera. */
  frame: { zoom: 1.205, x: 0, y: 0.0312 },
  grade: { contrast: 1.0675, saturation: 1, lookMix: 1, vignette: 0.25, grain: 0 },
  bloom: { strength: 0.025, radius: 2, threshold: 1.5, outside: 1 },
};
