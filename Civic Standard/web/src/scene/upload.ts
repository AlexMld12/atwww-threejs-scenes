import * as THREE from 'three';

// Big pictures cost a frame twice: decoding (an <img> is decoded on the main thread when first drawn) and the upload
// to the GPU (on the first render that uses them). Both are taken out of the frames that show them: decoded off the
// main thread as an ImageBitmap, uploaded one a frame while the scene is still hidden.

const loader = (imageOrientation: ImageOrientation) =>
  new THREE.ImageBitmapLoader().setOptions({
    imageOrientation,
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
const bitmaps = loader('flipY');
// a glTF model's textures (its AO): its uvs have the picture's top row first
const unflipped = loader('from-image');

/**
 * A picture as a texture, decoded off the main thread, already the right way up (`flip` false: as stored, for a
 * glTF's uvs). As an <img>, a texture is decoded when first uploaded: the small ones together took a frame.
 */
export async function loadBitmap(url: string, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace, flip = true) {
  const texture = new THREE.Texture(await (flip ? bitmaps : unflipped).loadAsync(url));
  texture.flipY = false;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Every texture `root` draws with (its materials', its environment and background), onto the GPU, one a frame. */
export async function uploadTextures(renderer: THREE.WebGLRenderer, root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const take = (value: unknown) => value instanceof THREE.Texture && textures.add(value);
  root.traverse((child) => {
    if (child instanceof THREE.Scene) [child.environment, child.background].forEach(take);
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of [child.material].flat() as THREE.Material[]) {
      Object.values(material).forEach(take);
      if (material instanceof THREE.ShaderMaterial) Object.values(material.uniforms).forEach((u) => take(u.value));
    }
  });
  for (const texture of textures) {
    // a render target's texture lives on the GPU already
    if (texture.isRenderTargetTexture) continue;
    renderer.initTexture(texture);
    await new Promise(requestAnimationFrame);
  }
}
