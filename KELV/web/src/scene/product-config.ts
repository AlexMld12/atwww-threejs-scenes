import type { PreloadTask } from '@/lib/preload';

export const PRODUCT_ASSETS = '/products/';

export type ProductName = 'K1_COOL_Foam' | 'K2_CALM_Serum' | 'K3_SEAL_Cream';

type Vec3 = [number, number, number];

interface ProductInfo {
  task: PreloadTask;
  /** Height of the GLB's pivot above the floor in the packshot scene (m). */
  centre: number;
}

export const PRODUCTS: Record<ProductName, ProductInfo> = {
  K1_COOL_Foam: { task: 'product-k1', centre: 0.0773 },
  K2_CALM_Serum: { task: 'product-k2', centre: 0.07075 },
  K3_SEAL_Cream: { task: 'product-k3', centre: 0.07075 },
};

/** The packshot camera: 200 mm lens, 1.2 m in front, 0.1 m above the floor, lens shift −0.0926 of the frame. */
export const PACKSHOT_CAMERA = { distance: 1.2, height: 0.1, fov: 10.285, shiftY: -0.0926 };

interface AreaLight {
  /** Blender position (Z up), turned into glTF space per product. */
  position: Vec3;
  watts: number;
  size: number;
}

/** The PACKSHOT rig (lighting_reference.json), all aimed at the product's centre. */
export const PACKSHOT_LIGHTS: Record<'key' | 'fill' | 'top', AreaLight> = {
  key: { position: [-0.78788, -0.21111, 0.45736], watts: 6, size: 0.7 },
  fill: { position: [0.85287, -0.4924, 0.25065], watts: 3.5, size: 1 },
  top: { position: [0, -0.20706, 0.84974], watts: 3, size: 0.6 },
};

// Fitted to the Figma renders, as for the hero (docs/SITE_FLOW.md).
export const PRODUCT_LOOK = {
  exposure: 0.5,
  key: 1.1,
  fill: 1,
  top: 1,
  environment: 1,
  /** Share of the white environment that lights the surfaces diffusely (Blender world 0.15). */
  diffuse: 0.15,
  roughness: 2.2,
  /** Mip bias of the label textures (negative = sharper). */
  textureBias: -0.75,
  /** K1's cap: grey of the glass (darkens what is seen through it) and a faint haze on it. */
  cap: { roughness: 0.03, transmission: 1, tint: 0.5, haze: 0 },
};

export type ProductLook = typeof PRODUCT_LOOK;
