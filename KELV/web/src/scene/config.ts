export const HERO_ASSETS = '/hero/';
export const HERO_MODEL = 'hero.glb';

/** Seconds into HERO_Full where the products form the Figma composition (frame 97). */
export const REST_TIME = 4;
export const INTRO_DURATION = REST_TIME;

type Vec3 = [number, number, number];

/** Offsets on top of the animation so the rest frame matches Figma (Euler XYZ, radians). */
export const POSE_CORRECTION: Record<string, { position: Vec3; rotation: Vec3 }> = {
  K2_CALM_Serum: { position: [0.00647, -0.00638, 0.11831], rotation: [0, 0, -0.0275] },
  K1_COOL_Foam: { position: [-0.00131, -0.00281, 0.0165], rotation: [0, 0, -0.025] },
  K3_SEAL_Cream: { position: [-0.00525, 0.00281, -0.00394], rotation: [0, 0, 0.0525] },
};

// Fitted to the Figma render at REST_TIME, patch by patch (docs/SITE_FLOW.md, HERO light fit).
export const LOOK = {
  exposure: -0.2,
  ambient: 1.02,
  rim: 1,
  top: 0.086,
  emission: 1.25,
  emissionColor: '#ffffff',
  /** K1's label: the glow of its white ground, and its print's own colour (low: the orange burns to yellow). */
  labelGlow: 0.8,
  labelPrint: 0.2,
  labelMaskPower: 6,
  roughness: 0.86,
  /** Self-illumination per product, standing in for the indirect light of the Cycles render. */
  lift: { K2_CALM_Serum: 0.04, K3_SEAL_Cream: 0.0425 },
  /** K1's light on K2, computed in its shader (`radius` in metres: where it has halved). */
  k1Spill: { strength: 0.22, radius: 0.06, wrap: 0.6 },
  /** K1's glow onto each neighbour: a light the size of its body, on its surface, facing that product. */
  glowLights: { K3_SEAL_Cream: 0.102 },
  cap: {
    roughness: 0.03,
    transmission: 1,
    ior: 1.49,
    thickness: 0.9,
    reflectivity: 2.35,
    // Neutral: a lavender tint turned the pump violet while K1 lights up.
    tint: '#ffffff',
    glow: 0.02,
    /** Brightness of the walls seen edge-on, where Cycles shows the pump's light inside the glass. */
    edge: 3,
    edgePower: 4,
  },
  /** A broad front light, and a small one on the cream's upper side. */
  fills: [
    { intensity: 1, position: [-0.094, 0.085, 0.304] as Vec3, target: [0.296, -0.5, 0] as Vec3, size: 0.2 },
    { intensity: 0.437, position: [0.14, 0.09, 0.1] as Vec3, target: [0.044, -0.013, -0.009] as Vec3, size: 0.06 },
  ],
  grade: { contrast: 1.11, saturation: 1, lookMix: 1, vignette: 0.5, grain: 0.1 },
  /** `outside`: share of the glow kept over the background (Figma has none there). */
  bloom: { strength: 0, radius: 2, threshold: 1, outside: 0 },
};

export type Look = typeof LOOK;
