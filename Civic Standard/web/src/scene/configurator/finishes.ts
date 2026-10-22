import * as THREE from 'three';

// The product studio's view transform, AgX with the High Contrast look (tools/blender_view_lut.py): a 48³ LUT over
// log2(scene-linear), from 0.18 · 2^-10 to 0.18 · 2^6.5, giving display sRGB. AgX mixes the channels, so the hero's
// curve per channel (view-curve.ts) cannot stand in for it; each material here ends with this instead of three's
// tone mapping, and the renderer writes its output as it is (LinearSRGBColorSpace, NoToneMapping).
const LUT_SIZE = 48;
const LOG2_MIN = Math.log2(0.18) - 10;
const LOG2_MAX = Math.log2(0.18) + 6.5;

// The finishes' detail (recycled plastic, zinc spangles) baked on a 0.5 m square, laid on each part's own metric
// coordinates (the _coord attribute, as the Blender materials do) and on the face they lie in.
const TILE_M = 0.5;

/** The LUT as a uniform, shared by every material that ends with the view transform. */
export const viewLut: THREE.IUniform<THREE.Data3DTexture | null> = { value: null };

/** The LUT png: N tiles of N × N, red across a tile, green up (bottom row first in Blender), blue tile by tile. */
export async function loadViewLut(url: string) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const n = LUT_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const from = ((n - 1 - g) * bitmap.width + b * n + r) * 4;
        const to = (r + g * n + b * n * n) * 4;
        data[to] = pixels[from];
        data[to + 1] = pixels[from + 1];
        data[to + 2] = pixels[from + 2];
        data[to + 3] = 255;
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, n, n, n);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapR = texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  viewLut.value = texture;
  return texture;
}

export const VIEW_TRANSFORM = /* glsl */ `
uniform highp sampler3D viewLut;
vec3 viewTransform( vec3 color ) {
  vec3 p = ( clamp( log2( max( color, vec3( 1e-10 ) ) ), ${LOG2_MIN.toFixed(6)}, ${LOG2_MAX.toFixed(6)} ) - ${LOG2_MIN.toFixed(6)} )
    / ${(LOG2_MAX - LOG2_MIN).toFixed(6)};
  return texture( viewLut, p * ${((LUT_SIZE - 1) / LUT_SIZE).toFixed(8)} + ${(0.5 / LUT_SIZE).toFixed(8)} ).rgb;
}
`;

// Picks the two coordinates of the face's plane: the attribute's own derivatives give the face's normal in it.
const DETAIL_UV = /* glsl */ `
  vec3 coordNormal = abs( cross( dFdx( vCoord ), dFdy( vCoord ) ) );
  vec2 detailUv = ( coordNormal.x > coordNormal.y && coordNormal.x > coordNormal.z ) ? vCoord.yz
    : ( coordNormal.y > coordNormal.z ? vCoord.xz : vCoord.xy );
  detailUv /= ${TILE_M.toFixed(3)};
`;

export interface Detail {
  colour: THREE.Texture;
  roughness: THREE.Texture;
}

/** The view transform, the baked occlusion on every light (not only the ambient, as three's aoMap) and the detail. */
export function finish(material: THREE.MeshStandardMaterial, detail?: Detail) {
  if (detail) {
    material.map = detail.colour;
    material.roughnessMap = detail.roughness;
    material.color.set(0xffffff);
    material.roughness = 1;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.viewLut = viewLut;
    if (detail) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', 'attribute vec3 _coord;\nvarying vec3 vCoord;\n#include <common>')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoord = _coord;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', 'varying vec3 vCoord;\n#include <common>')
        .replace('#include <map_fragment>', `${DETAIL_UV}\ndiffuseColor *= texture2D( map, detailUv );`)
        .replace(
          '#include <roughnessmap_fragment>',
          'float roughnessFactor = roughness * texture2D( roughnessMap, detailUv ).g;',
        );
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${VIEW_TRANSFORM}`)
      .replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\nreflectedLight.directDiffuse *= ambientOcclusion;\nreflectedLight.directSpecular *= ambientOcclusion;',
      )
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = viewTransform( gl_FragColor.rgb );');
  };
  material.customProgramCacheKey = () => (detail ? 'configurator-detail' : 'configurator');
  material.needsUpdate = true;
  return material;
}

export function detailTexture(texture: THREE.Texture, colour: boolean) {
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** The view LUT and both finishes' detail, from the configurator's assets. */
export function loadFinishes(assets: string, loader: THREE.TextureLoader): Promise<Detail[]> {
  return Promise.all([
    loadViewLut(assets + 'view-lut.png'),
    ...['plastic', 'zinc'].flatMap((name) =>
      ['colour', 'roughness'].map((kind) =>
        loader.loadAsync(`${assets}finish-${name}-${kind}.webp`).then((t) => detailTexture(t, kind === 'colour')),
      ),
    ),
  ]).then(([, plasticColour, plasticRoughness, zincColour, zincRoughness]) => [
    { colour: plasticColour, roughness: plasticRoughness },
    { colour: zincColour, roughness: zincRoughness },
  ]);
}

/** A product's materials as its studio has them; returns the painted ones, which the palette colours. */
export function dress(root: THREE.Object3D, ao: THREE.Texture, [plastic, zinc]: Detail[]) {
  const painted: THREE.MeshStandardMaterial[] = [];
  let hasPaint = false;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && (child.material as THREE.Material).name.startsWith('steel_painted'))
      hasPaint = true;
  });
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.MeshStandardMaterial;
    // the palette paints the frame: K7 has no painted part in the catalogue (galvanised), so its frame is it
    const name = material.name.split('.')[0];
    const key = name === 'steel_galvanised' && !hasPaint ? 'steel_painted' : name;
    material.aoMap = ao;
    material.envMapIntensity = 1;
    if (key === 'plastic_recycled') finish(material, plastic);
    else if (key === 'steel_galvanised') finish(material, zinc);
    else finish(material);
    if (key === 'steel_painted') {
      // as the studio's powder coat (UF_MAT_steel_painted)
      material.metalness = 0;
      material.roughness = 0.485;
      painted.push(material);
    }
  });
  return painted;
}
