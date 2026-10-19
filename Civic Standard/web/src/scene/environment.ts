import * as THREE from 'three';
import { WALL_HEIGHT, WALL_WIDTH } from './backdrop';
import { BACKDROP, GLASS, LOGO } from './config';

/**
 * What the glass reflects. In Cycles its glossy rays see the studio HDR (at 0.65) and also hit the bright leaf wall
 * behind the logo, which is what lights up the dark side walls; so both go into one map, captured from the logo.
 */
export function createReflections(
  renderer: THREE.WebGLRenderer,
  studio: THREE.Texture,
  backdropMap: THREE.Texture,
  leavesMap: THREE.Texture,
) {
  const capture = new THREE.Scene();
  capture.background = studio;
  capture.backgroundIntensity = GLASS.envIntensity;
  // Blender's equirect seam sits half a turn from three's.
  capture.backgroundRotation.y = Math.PI;

  // The whole rendered wall, which the side walls catch at grazing angles.
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT),
    // aoMap = the leaves' shadow: ao = 1 − intensity · (1 − r) maps it back onto leavesMin…1.
    new THREE.MeshBasicMaterial({
      map: backdropMap,
      aoMap: leavesMap,
      aoMapIntensity: 1 - BACKDROP.leavesMin,
      color: new THREE.Color().setScalar(BACKDROP.gain),
    }),
  );
  wall.position.z = -BACKDROP.distance;
  capture.add(wall);

  // A plain cube is enough: the glass is almost a mirror (roughness 0.025), so it needs no blurred levels.
  const target = new THREE.WebGLCubeRenderTarget(GLASS.reflectionSize, { type: THREE.HalfFloatType });
  const camera = new THREE.CubeCamera(0.1, 100, target);
  camera.position.set(LOGO.offsetX, 0, 0);
  camera.update(renderer, capture);
  wall.geometry.dispose();
  wall.material.dispose();
  return target;
}
