import * as THREE from 'three';
import { createFoliage } from './foliage';

// The plaza's sun, shared by the hero and the gallery: its view over the plaza and the leaves' live shadow in it.

// The balance of the two lights against Blender's (softer shadows, as Figma's render has them).
export const LIGHT = { sky: 1.7, sun: 0.85 };

// Blender is z-up; three y-up: (x, y, z) → (x, z, −y).
export const fromBlender = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);

/** The sun's light through the leaves at a point: 1 in the open. */
export const SUN_COOKIE = /* glsl */ `
uniform sampler2D foliage;
uniform mat4 foliageMatrix;
float sunCookie( vec3 world ) {
  vec2 uv = ( foliageMatrix * vec4( world, 1.0 ) ).xy;
  if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return 1.0;
  return texture2D( foliage, uv ).r;
}
`;

/** `towards`: the sun's direction (three's axes). The uniforms go to every material that reads SUN_COOKIE. */
export function createSunCookie(towards: THREE.Vector3) {
  const sunView = new THREE.OrthographicCamera();
  sunView.position.copy(towards).multiplyScalar(30);
  sunView.lookAt(0, 0, 0);
  sunView.updateMatrixWorld();
  // the area the leaves shade: the plaza the camera can see, from the sun
  const seen = new THREE.Box3(new THREE.Vector3(-8, 0, -3.2), new THREE.Vector3(8, 5.5, 4.5));
  const across = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? seen.max.x : seen.min.x, i & 2 ? seen.max.y : seen.min.y, i & 4 ? seen.max.z : seen.min.z);
    across.expandByPoint(corner.applyMatrix4(sunView.matrixWorldInverse));
  }
  const area = new THREE.Vector4(across.min.x, across.min.y, across.max.x - across.min.x, across.max.y - across.min.y);
  // where the shade falls (Blender's plaza, across the sun's view): the left of the paving and the upper wall, with
  // a few branches reaching over the product; the tree stands off the frame, front left
  const sunSpace = ([x, y, z]: number[]) => {
    const p = fromBlender([x, y, z]).applyMatrix4(sunView.matrixWorldInverse);
    return new THREE.Vector2(p.x, p.y);
  };
  const from = [sunSpace([-9, -5, 0]), sunSpace([-8, -2, 0]), sunSpace([-7, -6, 0])];
  const reach = [
    sunSpace([-1.2, -1.2, 0]),
    sunSpace([-2.4, 0.4, 0]),
    sunSpace([0.8, 2.75, 3.2]),
    sunSpace([2.6, 2.75, 3.8]),
    sunSpace([-0.6, 2.75, 2.4]),
    sunSpace([1.8, 2.75, 2.2]),
    sunSpace([-3.4, -2.4, 0]),
  ];
  const foliage = createFoliage(area, from, reach);
  const foliageMatrix = new THREE.Matrix4()
    .makeScale(1 / area.z, 1 / area.w, 1)
    .multiply(new THREE.Matrix4().makeTranslation(-area.x, -area.y, 0))
    .multiply(sunView.matrixWorldInverse);
  const cookie = { foliage: { value: foliage.texture }, foliageMatrix: { value: foliageMatrix } };
  return { sunView, foliage, cookie };
}
