export const HERO_ASSETS = '/hero/';
export const HERO_MODEL = 'hero.glb';

/** Seconds into HERO_Full where the products form the Figma composition (frame 97). */
export const REST_TIME = 4;
export const INTRO_DURATION = REST_TIME;

type Vec3 = [number, number, number];

/**
 * World-space offsets on top of the animation, at every frame, so the rest frame matches
 * the Figma render (silhouette IoU 0.80 → 0.98). Rotations are Euler XYZ in radians;
 * products stay at least 13 mm apart over the whole clip.
 */
export const POSE_CORRECTION: Record<string, { position: Vec3; rotation: Vec3 }> = {
  K2_CALM_Serum: { position: [0.00647, -0.00638, 0.11831], rotation: [0, 0, -0.0275] },
  K1_COOL_Foam: { position: [-0.00131, -0.00281, 0.0165], rotation: [0, 0, -0.025] },
  K3_SEAL_Cream: { position: [-0.00525, 0.00281, -0.00394], rotation: [0, 0, 0.0525] },
};

export const LOOK = {
  exposure: 0,
  ambient: 1,
  rim: 1,
  top: 1,
  emissionColor: '#ffffff',
  bounce: 1,
  cap: { roughness: 0.03, transmission: 1, ior: 1.49, thickness: 0.9, reflectivity: 2, tint: '#ffffff' },
  /** Low front light on the cream: lifts its body and base like the Figma render without lighting the serum. */
  fill: { intensity: 1, position: [0.2, -0.3, 0.15] as Vec3, target: [0.04, -0.04, 0] as Vec3, size: 0.2 },
  grade: { contrast: 1.06, saturation: 1, lookMix: 1, vignette: 0.5, grain: 0.1 },
  bloom: { strength: 0.12, radius: 2, threshold: 1 },
};

export type Look = typeof LOOK;
